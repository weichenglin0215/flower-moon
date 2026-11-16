-- =============================================================================
-- 《花月》玩家意見（提意見）— SQL 草案
--
-- 背景：
--   玩家可以從兩個入口寫下意見，供開發者之後優化參考：
--     ① 每款遊戲的結算彈窗（「下一關／再試一次」左邊的「提意見」）→ scope = 'game'，記著是哪一款遊戲
--     ② 漢堡選單「關於花月」右邊的「提意見」                        → scope = 'system'，系統面／全面性的問題
--   做法參考 FadingMemory 專案的 MF_feedback（supabase/MF_leaderboard.sql 第 5 節）。
--
-- 設計重點（與前端 supabaseClient.js／feedbackDialog.js、後台 tools/db_viewer.html 對應）：
--   1. 資料表 player_feedback 完全鎖住（開 RLS、不建 policy、收回匿名權限）：
--      玩家只能透過函式 fm_submit_feedback 寫入，不能直接 insert／update／delete，也讀不到別人的意見。
--   2. 查閱走公開檢視表 player_feedback_public（除了 player_id 以外的欄位），
--      後台 db_viewer.html 的「玩家意見查閱」用花月本來就公開的 publishable key 讀它，
--      不需要任何額外的金鑰或密碼。
--      ⚠️ 唯一不公開的是 player_id（內部鍵，公開了別人就能拿去冒用）。暱稱本來就公開在群英榜上。
--   3. 沒有帳號的訪客也能提意見（player_id 為 null、暱稱留空）；有帳號者，暱稱由資料庫依 id 帶入，
--      不採信網頁傳來的暱稱。
--   4. 防濫用（都在資料庫端，不靠網頁）：
--        · 內容 2～500 字，控制字元與零寬字元會被清掉
--        · 同一個帳號 24 小時內最多 30 則
--        · 訪客沒有身分可追，只能「整體限流」：所有訪客合計 1 小時最多 60 則
--        · 10 分鐘內同一人、同一處、同樣內容只算一則
--
-- 執行順序：第 1 節 → 第 2 節 → 第 3 節（權限）→ 第 4 節（驗證）→ 最後才部署前端。
--          前端找不到 fm_submit_feedback 時，玩家的意見會先存在那支手機，之後連上資料庫再自動補送，不會遺失。
--
-- ⚠️ 這份檔案是「草案」：由使用者在 Supabase 後台 SQL Editor 自行執行。可以重複執行（全部是 if not exists／create or replace）。
-- =============================================================================


-- =============================================================================
-- 1. 資料表（鎖住）
-- =============================================================================
create table if not exists player_feedback (
    id          bigint       generated always as identity primary key,
    scope       text         not null check (scope in ('game', 'system')),
    game_key    text         check (game_key is null or game_key ~ '^game[0-9]{1,3}$'),   -- 'game22'；系統意見為 null
    game_title  text         check (game_title is null or char_length(game_title) <= 30),  -- '詩詞拼圖'（前端帶來，伺服器只清理不驗證）
    player_id   text,                                                                       -- = player_saves.id；訪客為 null
    nickname    text,
    message     text         not null check (char_length(message) between 2 and 500),
    app_version text         check (app_version is null or char_length(app_version) <= 32),
    created_at  timestamptz  not null default now(),
    -- 針對遊戲的意見一定要有遊戲代號
    constraint player_feedback_game_has_key check (scope = 'system' or game_key is not null)
);

comment on table  player_feedback is '玩家意見（提意見）；匿名角色無權限，只能經 fm_submit_feedback 寫入、經 player_feedback_public 查閱';
comment on column player_feedback.scope       is 'game＝針對某款遊戲（結算彈窗的提意見）；system＝系統面／全面性（漢堡選單的提意見）';
comment on column player_feedback.player_id   is 'player_saves.id；訪客為 null。不公開（公開檢視表沒有這一欄）';

create index if not exists idx_player_feedback_created on player_feedback (created_at desc);
create index if not exists idx_player_feedback_game    on player_feedback (game_key, created_at desc);
create index if not exists idx_player_feedback_player  on player_feedback (player_id, created_at desc);

alter table player_feedback enable row level security;         -- 不建立任何 policy = 全部拒絕
revoke all on player_feedback from public, anon, authenticated;


-- =============================================================================
-- 2. 公開檢視表 ＋ 寫入函式
-- =============================================================================

-- 2.1 公開查閱用的檢視表：除了 player_id 以外的所有欄位，任何人（anon）都只能 select。
--     檢視表以建立者（資料表擁有者）的權限執行，所以讀得到被 RLS 鎖住的資料表；沒有 insert／update／delete 權限。
--     （Supabase 的安全檢查若提示「Security Definer View」，這是故意的：就是要公開這份「去掉 player_id」的內容。）
create or replace view player_feedback_public as
select id, created_at, scope, game_key, game_title, message, nickname, app_version
  from player_feedback;

comment on view player_feedback_public is '玩家意見的公開查閱版（不含 player_id）；任何人都能讀，不能寫';
revoke all   on player_feedback_public from public, anon, authenticated;
grant  select on player_feedback_public to anon, authenticated;

-- 2.2 寫入：送出一則意見。
--   回傳：
--     { ok:true,  saved:true }                        已儲存
--     { ok:true,  saved:false, duplicate:true }       10 分鐘內重複送同樣內容（不重複寫入，前端當作成功）
--     { ok:false, error:'bad_args' | 'too_many' }     參數不合格／超過次數
create or replace function fm_submit_feedback(
    p_scope      text,
    p_game_key   text,
    p_game_title text,
    p_player_id  text,
    p_message    text,
    p_version    text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
    c_max_len        constant int := 500;   -- 意見最多幾個字（前端輸入框同為 500）
    c_per_day        constant int := 30;    -- 同一個帳號 24 小時內最多幾則
    c_guest_per_hour constant int := 60;    -- 所有訪客合計 1 小時最多幾則
    v_scope  text := lower(btrim(coalesce(p_scope, '')));
    v_key    text := null;
    v_title  text := null;
    v_msg    text;
    v_pid    text := null;
    v_nick   text := null;
    v_ver    text;
    v_count  int;
begin
    -- (1) 範圍與遊戲代號
    if v_scope not in ('game', 'system') then
        return jsonb_build_object('ok', false, 'error', 'bad_args');
    end if;
    if v_scope = 'game' then
        v_key := lower(btrim(coalesce(p_game_key, '')));
        if v_key !~ '^game[0-9]{1,3}$' then
            return jsonb_build_object('ok', false, 'error', 'bad_args');
        end if;
        -- 遊戲名稱：去控制字元、去頭尾空白、最多 30 字；空的就存 null
        v_title := nullif(btrim(left(regexp_replace(coalesce(p_game_title, ''), '[\x01-\x1f\x7f]+', ' ', 'g'), 30)), '');
    end if;

    -- (2) 清理內容：換行統一成 \n；控制字元（保留換行與 Tab）、零寬字元、文字方向控制字元換成空格；
    --     行內連續空白縮成一個；連續三個以上的換行縮成兩個；去頭尾空白；最多 500 個字
    v_msg := replace(replace(coalesce(p_message, ''), E'\r\n', E'\n'), E'\r', E'\n');
    v_msg := regexp_replace(v_msg, '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f​-‏‪-‮⁠-⁤﻿]+', ' ', 'g');
    v_msg := regexp_replace(v_msg, '[ \t]+', ' ', 'g');
    v_msg := regexp_replace(v_msg, ' ?\n ?', E'\n', 'g');
    v_msg := regexp_replace(v_msg, '\n{3,}', E'\n\n', 'g');
    v_msg := btrim(left(btrim(v_msg), c_max_len));
    if char_length(v_msg) < 2 then
        return jsonb_build_object('ok', false, 'error', 'bad_args');
    end if;

    -- (3) 是哪位玩家：帶了 id 而且確實是已存在的帳號 → 記下 id 並由資料庫帶入暱稱；
    --     沒帶、或查不到（舊的本機 id、手動亂填）→ 當作訪客（player_id 與暱稱留空）
    if btrim(coalesce(p_player_id, '')) <> '' then
        select s.id, s.nickname into v_pid, v_nick
          from player_saves s where s.id = btrim(p_player_id);
    end if;

    -- 版本是選填
    v_ver := left(btrim(coalesce(p_version, '')), 32);
    if char_length(v_ver) < 1 then v_ver := null; end if;

    -- (4) 同一個人（或所有訪客）的寫入排隊，避免同時送很多則繞過次數限制
    perform pg_advisory_xact_lock(hashtextextended('fm_feedback:' || coalesce(v_pid, '(guest)'), 0));

    -- (5) 10 分鐘內同一人、同一處、同樣內容：不重複寫入
    if exists (select 1 from player_feedback f
                where f.player_id is not distinct from v_pid
                  and f.scope = v_scope
                  and f.game_key is not distinct from v_key
                  and f.message = v_msg
                  and f.created_at > now() - interval '10 minutes') then
        return jsonb_build_object('ok', true, 'saved', false, 'duplicate', true);
    end if;

    -- (6) 次數上限：帳號看 24 小時、訪客看整體 1 小時
    if v_pid is not null then
        select count(*) into v_count from player_feedback f
         where f.player_id = v_pid and f.created_at > now() - interval '24 hours';
        if v_count >= c_per_day then
            return jsonb_build_object('ok', false, 'error', 'too_many');
        end if;
    else
        select count(*) into v_count from player_feedback f
         where f.player_id is null and f.created_at > now() - interval '1 hour';
        if v_count >= c_guest_per_hour then
            return jsonb_build_object('ok', false, 'error', 'too_many');
        end if;
    end if;

    insert into player_feedback (scope, game_key, game_title, player_id, nickname, message, app_version)
    values (v_scope, v_key, v_title, v_pid, v_nick, v_msg, v_ver);
    return jsonb_build_object('ok', true, 'saved', true);
end;
$$;


-- =============================================================================
-- 3. 權限：函式預設對 PUBLIC 開放執行，先收回，再只開放給前端用的角色
-- =============================================================================
revoke all on function fm_submit_feedback(text, text, text, text, text, text) from public;
grant execute on function fm_submit_feedback(text, text, text, text, text, text) to anon, authenticated;


-- =============================================================================
-- 4. 驗證用查詢（不會改正式資料以外的東西；測完用 5.2 刪掉測試意見）
-- =============================================================================

-- 4.1 煙霧測試（在 SQL Editor 依序執行；SQL Editor 是管理者身分，不受限制）
--   select fm_submit_feedback('game', 'game22', '詩詞拼圖', '', '測試：結算彈窗的提意見', 'test');   -- 期望 {"ok": true, "saved": true}
--   select fm_submit_feedback('game', 'game22', '詩詞拼圖', '', '測試：結算彈窗的提意見', 'test');   -- 期望 {"ok": true, "saved": false, "duplicate": true}
--   select fm_submit_feedback('system', null, null, '', '測試：系統面的意見', 'test');               -- 期望 saved:true
--   select fm_submit_feedback('game', 'oops', null, '', '遊戲代號不合格', 'test');                   -- 期望 {"ok": false, "error": "bad_args"}
--   select * from player_feedback_public order by id desc limit 20;

-- 4.2 管理者在 SQL Editor 常用的查詢
--   select created_at, scope, game_title, nickname, message from player_feedback order by id desc limit 100;   -- 最新 100 則
--   select game_title, count(*) from player_feedback where scope = 'game' group by 1 order by 2 desc;          -- 哪款遊戲被提最多意見
--   select created_at, nickname, message from player_feedback where scope = 'system' order by id desc;         -- 只看系統面的意見


-- =============================================================================
-- 5. 維運
-- =============================================================================

-- 5.1 清掉太舊的意見
--   delete from player_feedback where created_at < now() - interval '180 days';

-- 5.2 刪掉測試意見（4.1 的）
--   delete from player_feedback where app_version = 'test';

-- 5.3 完整移除（慎用；前端也要同步退版，否則玩家的意見會一直先存在手機等補送）
--   drop function if exists fm_submit_feedback(text, text, text, text, text, text);
--   drop view     if exists player_feedback_public;
--   drop table    if exists player_feedback;
