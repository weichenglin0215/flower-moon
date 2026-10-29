-- =============================================================================
-- 《花月》帳號制度改版：「暱稱（全站唯一）＋四位數密碼」— SQL 草案
--
-- 背景：
--   舊制是「暱稱#XXXX 引繼碼」，引繼碼存在各瀏覽器自己的 localStorage，
--   同一支手機換個瀏覽器就得手打完整引繼碼才能接回進度。
--   新制改成玩家自己取全站唯一的暱稱、自己設四位數密碼，
--   任何裝置／瀏覽器輸入「暱稱＋密碼」就能登入同一份資料。
--
-- 設計重點（與前端 supabaseClient.js／cloudSaveDialog.js 對應）：
--   1. player_saves.id 仍是「不可變的內部鍵」，game_logs／player_game_stats／
--      player_daily_stats／silver_events 的 player_id 全都靠它，所以 id 不改。
--      舊玩家保留 李白#1234 這類 id；新玩家由 fm_register 產生 U＋10 碼十六進位。
--   2. 密碼雜湊與暱稱唯一性放在獨立的 player_credentials 表，
--      並關閉匿名角色的一切權限，只能透過下方 SECURITY DEFINER 函式操作。
--      ⚠️ 不放進 player_saves：前端大量使用 select('*')，放進去雜湊會被整包讀出去。
--   3. 密碼錯誤 5 次鎖定 15 分鐘（伺服器端計次，只有四位數字，不鎖等於沒有密碼）。
--
-- 執行順序：第 1 節 → 第 2 節 → 第 3 節 → 第 4 節（舊玩家預留暱稱）→ 第 5 節（驗證）
--          → 最後才部署前端（前端找不到這些函式時會顯示「伺服器尚未升級」）。
--
-- ⚠️ 本檔案的誠實限制：
--   · 這只保護「用暱稱＋密碼登入」這條路。player_saves 等既有資料表對匿名金鑰
--     仍是開放讀寫（既有情況，本次不變好也不變壞）。要真正防止別人改寫存檔，
--     需要 RLS 搭配簽發 token，是另一個專案。
--   · 鎖定以「帳號」為單位：有心人可以故意輸錯讓別人暫時登不進去（15 分鐘）。
--   · 忘記密碼沒有自助管道（無 email）。重設請見第 6 節。
-- =============================================================================


-- =============================================================================
-- 1. 前置：加密擴充、暱稱正規化函式
-- =============================================================================

-- Supabase 的 pgcrypto 預設裝在 extensions schema，下方函式的 search_path 已包含它
create extension if not exists pgcrypto with schema extensions;

-- 暱稱正規化：全形轉半形(NFKC)、連續空白縮成一格、去頭尾空白、轉小寫。
-- 「李白」「 李白 」「Ｌi Bai」「li bai」分別視為同一個暱稱，避免用空白或全半形魚目混珠。
create or replace function fm_nick_key(p text)
returns text
language sql
immutable
as $$
    select lower(btrim(regexp_replace(normalize(coalesce(p, ''), NFKC), '\s+', ' ', 'g')))
$$;


-- =============================================================================
-- 2. player_credentials：暱稱唯一性＋密碼雜湊（匿名角色完全不可直接存取）
-- =============================================================================
create table if not exists player_credentials (
    id            text        primary key,          -- = player_saves.id
    nickname_key  text        not null,             -- fm_nick_key(暱稱)，全站唯一
    pin_hash      text        null,                 -- bcrypt；null = 舊玩家尚未設定密碼
    fail_count    int         not null default 0,   -- 連續輸錯次數
    locked_until  timestamptz null,                 -- 鎖定到何時
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

create unique index if not exists uq_player_credentials_nick
    on player_credentials (nickname_key);

comment on table  player_credentials is '暱稱唯一性與四位數密碼雜湊；匿名角色無權限，僅能經 fm_* 函式存取';
comment on column player_credentials.pin_hash is 'bcrypt；null 代表舊玩家尚未設定密碼';

alter table player_credentials enable row level security;   -- 不建立任何 policy = 全部拒絕
revoke all on player_credentials from anon, authenticated;


-- =============================================================================
-- 3. 函式（全部 SECURITY DEFINER；搜尋路徑固定，避免被劫持）
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 3.0 內部：驗證密碼並處理鎖定。⚠️ 不開放給前端直接呼叫。
--     回傳 jsonb：{ok:true} | {ok:false, reason:'locked'|'no_pin'|'bad_pin'|'not_found', ...}
--     刻意「不回傳 id」：id 是舊制的憑證，不能因為一個失敗的分支而外洩。
--     輸錯時的計次要在同一個交易內寫入，所以這裡一律 return 而不 raise。
-- -----------------------------------------------------------------------------
create or replace function fm__check_pin(p_id text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    r          player_credentials%rowtype;
    v_new_fail int;
begin
    select * into r from player_credentials where id = p_id for update;
    if not found then
        return jsonb_build_object('ok', false, 'reason', 'not_found');
    end if;

    if r.locked_until is not null and r.locked_until > now() then
        return jsonb_build_object('ok', false, 'reason', 'locked',
            'locked_seconds', ceil(extract(epoch from (r.locked_until - now())))::int);
    end if;

    if r.pin_hash is null then
        return jsonb_build_object('ok', false, 'reason', 'no_pin');
    end if;

    if p_pin ~ '^\d{4}$' and r.pin_hash = crypt(p_pin, r.pin_hash) then
        update player_credentials
           set fail_count = 0, locked_until = null, updated_at = now()
         where id = p_id;
        return jsonb_build_object('ok', true);
    end if;

    v_new_fail := r.fail_count + 1;
    if v_new_fail >= 5 then
        update player_credentials
           set fail_count = 0, locked_until = now() + interval '15 minutes', updated_at = now()
         where id = p_id;
        return jsonb_build_object('ok', false, 'reason', 'locked', 'locked_seconds', 900);
    end if;

    update player_credentials set fail_count = v_new_fail, updated_at = now() where id = p_id;
    return jsonb_build_object('ok', false, 'reason', 'bad_pin', 'attempts_left', 5 - v_new_fail);
end;
$$;

-- -----------------------------------------------------------------------------
-- 3.1 暱稱是否可用（p_id 給「改名」用：自己目前的暱稱不算被占用）
-- -----------------------------------------------------------------------------
create or replace function fm_check_nickname(p_nickname text, p_id text default null)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_key text := fm_nick_key(p_nickname);
begin
    if v_key = '' or length(btrim(p_nickname)) > 20 or position('#' in p_nickname) > 0 then
        return false;
    end if;
    return not exists (
        select 1 from player_credentials
         where nickname_key = v_key
           and (p_id is null or id <> p_id)
    );
end;
$$;

-- -----------------------------------------------------------------------------
-- 3.2 註冊新帳號：{ok:true,id} | {ok:false,reason:'bad_nickname'|'bad_pin'|'taken'}
--     id 由伺服器產生，player_saves 的那一列仍由前端 upsert 建立（沿用既有流程）。
-- -----------------------------------------------------------------------------
create or replace function fm_register(p_nickname text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_nick text := btrim(coalesce(p_nickname, ''));
    v_key  text := fm_nick_key(p_nickname);
    v_id   text;
begin
    if v_key = '' or length(v_nick) > 20 or position('#' in v_nick) > 0 then
        return jsonb_build_object('ok', false, 'reason', 'bad_nickname');
    end if;
    if p_pin is null or p_pin !~ '^\d{4}$' then
        return jsonb_build_object('ok', false, 'reason', 'bad_pin');
    end if;

    v_id := 'U' || upper(substr(md5(random()::text || clock_timestamp()::text || v_key), 1, 10));
    begin
        insert into player_credentials (id, nickname_key, pin_hash)
        values (v_id, v_key, crypt(p_pin, gen_salt('bf')));
    exception when unique_violation then
        return jsonb_build_object('ok', false, 'reason', 'taken');
    end;
    return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- 3.3 登入：{ok:true,id} | {ok:false,reason:'not_found'|'bad_pin'|'locked'|'no_pin', ...}
--     'no_pin' = 這是尚未設定密碼的舊帳號，請玩家改用舊引繼碼認領（fm_claim_legacy）。
-- -----------------------------------------------------------------------------
create or replace function fm_login(p_nickname text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_id  text;
    v_res jsonb;
begin
    select id into v_id from player_credentials where nickname_key = fm_nick_key(p_nickname);
    if v_id is null then
        return jsonb_build_object('ok', false, 'reason', 'not_found');
    end if;
    v_res := fm__check_pin(v_id, p_pin);
    if (v_res ->> 'ok')::boolean then
        return v_res || jsonb_build_object('id', v_id);   -- 驗證通過才交出 id
    end if;
    return v_res;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3.4 帳號狀態（前端啟動時判斷舊玩家要不要被要求設定密碼）
--     {has_pin:boolean, reserved:boolean}
-- -----------------------------------------------------------------------------
create or replace function fm_account_status(p_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    r player_credentials%rowtype;
begin
    select * into r from player_credentials where id = p_id;
    return jsonb_build_object('has_pin', found and r.pin_hash is not null, 'reserved', found);
end;
$$;

-- -----------------------------------------------------------------------------
-- 3.5 舊玩家認領：用舊 id（李白#1234）為憑證，設定新暱稱（可沿用）與密碼。
--     {ok:true} | {ok:false,reason:'bad_nickname'|'bad_pin'|'no_player'|'already_set'|'taken'}
--     'no_player' = player_saves 查無此 id（前端會先把本機進度存上雲端再重試一次）。
-- -----------------------------------------------------------------------------
create or replace function fm_claim_legacy(p_id text, p_nickname text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_nick text := btrim(coalesce(p_nickname, ''));
    v_key  text := fm_nick_key(p_nickname);
    r      player_credentials%rowtype;
begin
    if v_key = '' or length(v_nick) > 20 or position('#' in v_nick) > 0 then
        return jsonb_build_object('ok', false, 'reason', 'bad_nickname');
    end if;
    if p_pin is null or p_pin !~ '^\d{4}$' then
        return jsonb_build_object('ok', false, 'reason', 'bad_pin');
    end if;
    if p_id is null or not exists (select 1 from player_saves where id = p_id) then
        return jsonb_build_object('ok', false, 'reason', 'no_player');
    end if;

    select * into r from player_credentials where id = p_id for update;
    if found and r.pin_hash is not null then
        return jsonb_build_object('ok', false, 'reason', 'already_set');
    end if;

    begin
        if found then
            -- 第 4 節替「暱稱沒有重複」的舊玩家預留了列；這裡補上密碼，必要時一併改暱稱
            update player_credentials
               set nickname_key = v_key, pin_hash = crypt(p_pin, gen_salt('bf')),
                   fail_count = 0, locked_until = null, updated_at = now()
             where id = p_id;
        else
            insert into player_credentials (id, nickname_key, pin_hash)
            values (p_id, v_key, crypt(p_pin, gen_salt('bf')));
        end if;
    exception when unique_violation then
        return jsonb_build_object('ok', false, 'reason', 'taken');
    end;

    update player_saves set nickname = v_nick, updated_at = now() where id = p_id;
    return jsonb_build_object('ok', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- 3.6 變更密碼（需舊密碼，同樣受錯誤鎖定保護）
-- -----------------------------------------------------------------------------
create or replace function fm_change_pin(p_id text, p_old text, p_new text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_res jsonb;
begin
    if p_new is null or p_new !~ '^\d{4}$' then
        return jsonb_build_object('ok', false, 'reason', 'bad_pin');
    end if;
    v_res := fm__check_pin(p_id, p_old);
    if not (v_res ->> 'ok')::boolean then
        return v_res;
    end if;
    update player_credentials
       set pin_hash = crypt(p_new, gen_salt('bf')), updated_at = now()
     where id = p_id;
    return jsonb_build_object('ok', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- 3.7 變更暱稱（以 id 為憑，與舊制一致；不需密碼）
--     同時更新 player_saves.nickname（排行榜 RPC 讀的就是這欄）。
-- -----------------------------------------------------------------------------
create or replace function fm_rename(p_id text, p_nickname text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_nick text := btrim(coalesce(p_nickname, ''));
    v_key  text := fm_nick_key(p_nickname);
begin
    if v_key = '' or length(v_nick) > 20 or position('#' in v_nick) > 0 then
        return jsonb_build_object('ok', false, 'reason', 'bad_nickname');
    end if;
    if not exists (select 1 from player_credentials where id = p_id) then
        return jsonb_build_object('ok', false, 'reason', 'not_found');
    end if;
    begin
        update player_credentials set nickname_key = v_key, updated_at = now() where id = p_id;
    exception when unique_violation then
        return jsonb_build_object('ok', false, 'reason', 'taken');
    end;
    update player_saves set nickname = v_nick, updated_at = now() where id = p_id;
    return jsonb_build_object('ok', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- 3.8 權限：函式預設對 PUBLIC 開放執行，先全部收回，再只開放前端要用的
-- -----------------------------------------------------------------------------
revoke all on function fm__check_pin(text, text)               from public, anon, authenticated;
revoke all on function fm_check_nickname(text, text)           from public;
revoke all on function fm_register(text, text)                 from public;
revoke all on function fm_login(text, text)                    from public;
revoke all on function fm_account_status(text)                 from public;
revoke all on function fm_claim_legacy(text, text, text)       from public;
revoke all on function fm_change_pin(text, text, text)         from public;
revoke all on function fm_rename(text, text)                   from public;

grant execute on function fm_check_nickname(text, text)        to anon, authenticated;
grant execute on function fm_register(text, text)              to anon, authenticated;
grant execute on function fm_login(text, text)                 to anon, authenticated;
grant execute on function fm_account_status(text)              to anon, authenticated;
grant execute on function fm_claim_legacy(text, text, text)    to anon, authenticated;
grant execute on function fm_change_pin(text, text, text)      to anon, authenticated;
grant execute on function fm_rename(text, text)                to anon, authenticated;


-- =============================================================================
-- 4. 舊玩家預留暱稱（一次性）
--    只替「全站只有一位玩家用這個暱稱」的舊帳號預留，避免新玩家搶走老玩家的名字。
--    暱稱有重複的舊帳號不預留：誰先在新版設定密碼，誰就拿到那個暱稱，
--    後到的人會被要求改名（這是「先到先得」的實作）。
--    可重複執行（on conflict do nothing）。
-- =============================================================================
insert into player_credentials (id, nickname_key)
select min(id), fm_nick_key(nickname)
  from player_saves
 where nickname is not null and fm_nick_key(nickname) <> ''
 group by fm_nick_key(nickname)
having count(*) = 1
on conflict do nothing;


-- =============================================================================
-- 5. 驗證用查詢（不會改資料）
-- =============================================================================

-- 5.1 哪些暱稱有多位舊玩家共用？（這些人需要「先到先得」，後到者要改名）
-- select fm_nick_key(nickname) as nick_key, count(*) as n,
--        array_agg(id order by total_score desc) as ids
--   from player_saves
--  where nickname is not null
--  group by 1 having count(*) > 1 order by n desc;

-- 5.2 已預留幾列、其中幾列已設定密碼
-- select count(*) as reserved, count(pin_hash) as with_pin from player_credentials;

-- 5.3 煙霧測試（在 SQL Editor 依序執行；測完用 6.2 刪掉測試帳號）
-- select fm_register('測試帳號', '1234');                  -- 回 {ok:true,id:...}
-- select fm_register(' 測試帳號 ', '9999');                -- 回 {ok:false,reason:'taken'}（空白不影響唯一性）
-- select fm_login('測試帳號', '0000');                     -- 回 bad_pin，attempts_left=4
-- select fm_login('測試帳號', '1234');                     -- 回 {ok:true,id:...}


-- =============================================================================
-- 6. 維運
-- =============================================================================

-- 6.1 玩家忘記密碼：由管理員把該帳號的密碼重設為指定值，請玩家登入後自行改密碼
-- update player_credentials
--    set pin_hash = crypt('0000', gen_salt('bf')), fail_count = 0, locked_until = null
--  where nickname_key = fm_nick_key('玩家的暱稱');

-- 6.2 刪除測試帳號（同時釋放暱稱）
-- delete from player_credentials where nickname_key = fm_nick_key('測試帳號');

-- 6.3 解除某帳號的鎖定
-- update player_credentials set fail_count = 0, locked_until = null
--  where nickname_key = fm_nick_key('玩家的暱稱');

-- 6.4 完整回復到舊制（慎用，前端也要同步退版）
-- drop function if exists fm_rename(text, text), fm_change_pin(text, text, text),
--      fm_claim_legacy(text, text, text), fm_account_status(text), fm_login(text, text),
--      fm_register(text, text), fm_check_nickname(text, text), fm__check_pin(text, text),
--      fm_nick_key(text);
-- drop table if exists player_credentials;
