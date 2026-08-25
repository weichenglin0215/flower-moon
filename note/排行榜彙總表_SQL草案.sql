-- =============================================================================
-- 《花月》排行榜／統計 彙總表重構 — SQL 草案
--
-- 目的：讓 game_logs 降級為「可拋棄的原始流水帳」，
--       排行榜與 db_viewer 統計改吃預先累加好的彙總表，
--       從此刪除舊 LOG 不會影響任何數字。
--
-- 執行順序：第 1 節 → 第 2 節 → 第 3 節 → 第 4 節（一次性 backfill）
--           → 第 5 節（RPC）→ 前端切換完成並比對數字無誤後，才執行第 6 節（保留期刪除）
--
-- ⚠️ 第 4 節的 backfill 是「累加型」資料的重建，重複執行會 double count。
--    腳本內已先 truncate，請整段一起跑，不要只跑 insert。
-- =============================================================================


-- =============================================================================
-- 1. 三張彙總表
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1.1 player_game_stats：每位玩家 × 每個遊戲 × 每個難度 的終身紀錄
--     用途：單遊戲最高分榜(B1)、單遊戲速通榜(B2)、單遊戲累計通關榜(B3)
--     列數上限固定 = 玩家數 × 40 遊戲 × 5 難度，不隨局數成長。
-- -----------------------------------------------------------------------------
create table if not exists player_game_stats (
    player_id        text        not null,
    game_no          int         not null,
    difficulty       text        not null,

    play_count       int         not null default 0,  -- 總局數（含失敗）
    win_count        int         not null default 0,  -- 通關局數
    best_score       int         not null default 0,  -- 單局最高分（只採計通關局）
    best_duration_s  int         null,                -- 最短通關秒數；null = 尚未通關
    total_score      bigint      not null default 0,  -- 累計得分（含失敗局的 0 分）
    total_duration_s bigint      not null default 0,  -- 累計遊玩秒數（含失敗局）
    last_played_at   timestamptz null,

    primary key (player_id, game_no, difficulty)
);

comment on table  player_game_stats                 is '玩家×遊戲×難度 終身彙總，由 game_logs 的 trigger 自動維護';
comment on column player_game_stats.best_score      is '只採計 is_win=true 的局，與舊版 fetchGameBoard 的過濾條件一致';
comment on column player_game_stats.best_duration_s is '只採計 is_win=true 且 duration_s>0 的局；null 代表此難度尚未通關過';

-- 高分榜用
create index if not exists idx_pgs_board_score
    on player_game_stats (game_no, difficulty, best_score desc)
    where win_count > 0;

-- 速通榜用（best_duration_s 為 null 的列直接排除在索引外）
create index if not exists idx_pgs_board_speed
    on player_game_stats (game_no, difficulty, best_duration_s asc)
    where best_duration_s is not null;


-- -----------------------------------------------------------------------------
-- 1.2 player_daily_stats：每位玩家 × 每天
--     用途：日／週／月總分榜(A1 時間切片)、總遊玩時長榜(F1)、
--           db_viewer 的「每日上線人數」「每日遊戲局數」
--     一位玩家一天一列。
--     ⚠️ day 以 Asia/Taipei 分日，不是 UTC（舊前端用 played_at.split('T')[0]
--        等於用 UTC 分日，台灣早上 8 點前的局會被算到前一天，本次一併修正）。
-- -----------------------------------------------------------------------------
create table if not exists player_daily_stats (
    player_id     text   not null,
    day           date   not null,

    games         int    not null default 0,  -- 當日總局數（含失敗）
    wins          int    not null default 0,  -- 當日通關局數
    score_sum     bigint not null default 0,  -- 當日得分總和
    duration_sum  bigint not null default 0,  -- 當日遊玩秒數總和

    -- ── 玩家遊戲日曆用 ──────────────────────────────────────────────
    ranked_wins   int    not null default 0,  -- 關卡模式（青雲梯／關卡選擇器）通關局數
    practice_wins int    not null default 0,  -- 自由練習（漢堡選單）通關局數
    silver_game   int    not null default 0,  -- 當日「玩遊戲」賺到的文錢
    silver_bonus  int    not null default 0,  -- 當日「晉升文位／領獎狀／江南小院」賺到的文錢
    silver_spent  int    not null default 0,  -- 當日花掉的文錢（考試報名費、布置江南小院…）

    primary key (player_id, day)
);

comment on table  player_daily_stats               is '玩家×日 彙總（Asia/Taipei 分日），由 game_logs 與 silver_events 的 trigger 自動維護';
comment on column player_daily_stats.ranked_wins   is 'LevelTable 有關卡情境的局；青雲梯與關卡選擇器都算';
comment on column player_daily_stats.practice_wins is 'LevelTable 無關卡情境的局；漢堡選單自由練習';
comment on column player_daily_stats.silver_game   is '來自 ScoreManager.saveScore 的 floor(score/100)，由 trigger 自行推算，前端不必傳';
comment on column player_daily_stats.silver_bonus  is '來自 silver_events 的正值事件（獎狀／文位／江南小院收入）';

create index if not exists idx_pds_day on player_daily_stats (day);


-- -----------------------------------------------------------------------------
-- 1.3 daily_game_stats：每天 × 每個遊戲 × 每個難度（不含 player_id）
--     用途：db_viewer 的「每遊戲總局數」「每難度總局數」「遊戲×難度」三張圖
--     不含 player_id，所以列數極小（每天最多 40×5 = 200 列），
--     可以無限期保留完整歷史。
-- -----------------------------------------------------------------------------
create table if not exists daily_game_stats (
    day          date   not null,
    game_no      int    not null,
    difficulty   text   not null,

    wins         int    not null default 0,
    fails        int    not null default 0,
    score_sum    bigint not null default 0,
    duration_sum bigint not null default 0,

    primary key (day, game_no, difficulty)
);

comment on table daily_game_stats is '日×遊戲×難度 彙總，不含玩家身分，永久保留';

create index if not exists idx_dgs_day on daily_game_stats (day);


-- -----------------------------------------------------------------------------
-- 1.4 game_logs 加一個欄位：is_ranked
--     true  = 關卡模式（青雲梯／關卡選擇器），可累積晉升文位
--     false = 自由練習（漢堡選單挑遊戲）
--     null  = 本次改版之前的舊資料，無從判別
--
--     判別方式寫在 supabaseClient.logGame 內部
--     （`!!(window.LevelTable && window.LevelTable.getContext())`），
--     41 個遊戲呼叫點不必傳這個參數。
-- -----------------------------------------------------------------------------
alter table game_logs add column if not exists is_ranked boolean;

comment on column game_logs.is_ranked is 'true=關卡模式(可累積晉升文位) / false=自由練習 / null=改版前舊資料';


-- -----------------------------------------------------------------------------
-- 1.5 silver_events：文錢流水帳（遊戲以外的來源）
--
--     為什麼需要它：
--       「玩遊戲賺的文錢」可以由 game_logs 的 score 直接推算（floor(score/100)），
--       但「領獎狀／晉升文位／江南小院經營」的文錢不經過 game_logs，
--       雲端完全看不到。要在日曆上把兩種文錢分開統計，就必須讓這些事件也留痕。
--
--     ⚠️ 這張表是「統計用的流水帳」，不是餘額的權威來源。
--        文錢餘額的權威仍然是 player_saves.collection.silver。
--        兩者若有落差（離線、寫入失敗），以餘額為準，日曆數字略少不影響玩家權益。
--
--     與 game_logs 一樣適用保留期刪除；彙總結果永久留在 player_daily_stats。
-- -----------------------------------------------------------------------------
create table if not exists silver_events (
    id         bigint generated always as identity primary key,
    player_id  text        not null,
    occurred_at timestamptz not null default now(),
    amount     int         not null,   -- 正值 = 獲得；負值 = 花費
    source     text        not null,   -- 'cert' 獎狀 / 'rank' 晉升文位 / 'garden' 江南小院 / 'exam_fee' 考試報名費 / 'decorate' 布置 / 'other'
    note       text        null        -- 例如獎狀 achId、購買的物件 id，除錯用
);

comment on table  silver_events        is '文錢流水帳（遊戲以外的來源）；統計用，非餘額權威';
comment on column silver_events.amount is '正值=獲得，負值=花費。花費目前只做統計，不參與日曆的兩種收入分類';

create index if not exists idx_silver_events_player_time
    on silver_events (player_id, occurred_at);


-- =============================================================================
-- 2. Trigger：唯一的彙總寫入者
--
--    掛在 game_logs 的 AFTER INSERT，與明細寫入在同一個交易內完成。
--    前端 41 個 logGame 呼叫點完全不需要修改。
--
--    security definer + 固定 search_path：
--      讓 trigger 以擁有者身分寫入，繞過彙總表的 RLS，
--      如此 anon key 只能 SELECT 彙總表、無法直接竄改自己的排名。
-- =============================================================================

create or replace function fm_apply_game_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
    v_day     date;
    v_game_no int;
    v_diff    text;
    v_score   int;
    v_dur     int;
    v_win     boolean;
    v_ranked  boolean;
    v_silver  int;
begin
    -- 未綁定引繼碼的局不該進來，防呆
    if new.player_id is null or new.player_id = '' then
        return null;
    end if;

    v_day     := (coalesce(new.played_at, now()) at time zone 'Asia/Taipei')::date;
    v_game_no := coalesce(new.game_no, 0);
    v_diff    := coalesce(new.difficulty, '');
    v_score   := coalesce(new.score, 0);
    v_dur     := greatest(coalesce(new.duration_s, 0), 0);
    v_win     := coalesce(new.is_win, false);

    -- is_ranked 為 null（改版前的舊資料）一律視為自由練習，寧可少算不要誤標
    v_ranked  := coalesce(new.is_ranked, false);

    -- 文錢：完全比照 ScoreManager.saveScore 的「100 分 = 1 文錢」，
    -- 且必須逐局 floor 後再相加（不是 floor(當日總分/100)），否則會多給。
    v_silver  := case when v_win then v_score / 100 else 0 end;

    ---------------------------------------------------------------------------
    -- 2.1 player_game_stats
    ---------------------------------------------------------------------------
    insert into player_game_stats as t (
        player_id, game_no, difficulty,
        play_count, win_count, best_score, best_duration_s,
        total_score, total_duration_s, last_played_at
    )
    values (
        new.player_id, v_game_no, v_diff,
        1,
        case when v_win then 1 else 0 end,
        case when v_win then v_score else 0 end,
        -- 只有通關且秒數 > 0 才算速通成績（避免 0 秒的假紀錄霸榜）
        case when v_win and v_dur > 0 then v_dur else null end,
        v_score, v_dur, coalesce(new.played_at, now())
    )
    on conflict (player_id, game_no, difficulty) do update set
        play_count       = t.play_count + 1,
        win_count        = t.win_count  + excluded.win_count,
        best_score       = greatest(t.best_score, excluded.best_score),
        best_duration_s  = case
                               when excluded.best_duration_s is null then t.best_duration_s
                               when t.best_duration_s is null        then excluded.best_duration_s
                               else least(t.best_duration_s, excluded.best_duration_s)
                           end,
        total_score      = t.total_score      + excluded.total_score,
        total_duration_s = t.total_duration_s + excluded.total_duration_s,
        last_played_at   = greatest(t.last_played_at, excluded.last_played_at);

    ---------------------------------------------------------------------------
    -- 2.2 player_daily_stats
    ---------------------------------------------------------------------------
    insert into player_daily_stats as t (
        player_id, day, games, wins, score_sum, duration_sum,
        ranked_wins, practice_wins, silver_game
    )
    values (
        new.player_id, v_day, 1,
        case when v_win then 1 else 0 end,
        v_score, v_dur,
        case when v_win and     v_ranked then 1 else 0 end,
        case when v_win and not v_ranked then 1 else 0 end,
        v_silver
    )
    on conflict (player_id, day) do update set
        games         = t.games + 1,
        wins          = t.wins  + excluded.wins,
        score_sum     = t.score_sum     + excluded.score_sum,
        duration_sum  = t.duration_sum  + excluded.duration_sum,
        ranked_wins   = t.ranked_wins   + excluded.ranked_wins,
        practice_wins = t.practice_wins + excluded.practice_wins,
        silver_game   = t.silver_game   + excluded.silver_game;

    ---------------------------------------------------------------------------
    -- 2.3 daily_game_stats
    ---------------------------------------------------------------------------
    insert into daily_game_stats as t (day, game_no, difficulty, wins, fails, score_sum, duration_sum)
    values (
        v_day, v_game_no, v_diff,
        case when v_win then 1 else 0 end,
        case when v_win then 0 else 1 end,
        v_score, v_dur
    )
    on conflict (day, game_no, difficulty) do update set
        wins         = t.wins  + excluded.wins,
        fails        = t.fails + excluded.fails,
        score_sum    = t.score_sum    + excluded.score_sum,
        duration_sum = t.duration_sum + excluded.duration_sum;

    return null; -- AFTER trigger，回傳值不影響寫入
end;
$fn$;

drop trigger if exists trg_game_logs_rollup on game_logs;

create trigger trg_game_logs_rollup
    after insert on game_logs
    for each row
    execute function fm_apply_game_log();


-- -----------------------------------------------------------------------------
-- 2.4 silver_events → player_daily_stats 的 trigger
--     正值進 silver_bonus，負值（取絕對值）進 silver_spent。
-- -----------------------------------------------------------------------------
create or replace function fm_apply_silver_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
    v_day date;
begin
    if new.player_id is null or new.player_id = '' or coalesce(new.amount, 0) = 0 then
        return null;
    end if;

    v_day := (coalesce(new.occurred_at, now()) at time zone 'Asia/Taipei')::date;

    insert into player_daily_stats as t (player_id, day, silver_bonus, silver_spent)
    values (
        new.player_id, v_day,
        case when new.amount > 0 then  new.amount else 0 end,
        case when new.amount < 0 then -new.amount else 0 end
    )
    on conflict (player_id, day) do update set
        silver_bonus = t.silver_bonus + excluded.silver_bonus,
        silver_spent = t.silver_spent + excluded.silver_spent;

    return null;
end;
$fn$;

drop trigger if exists trg_silver_events_rollup on silver_events;

create trigger trg_silver_events_rollup
    after insert on silver_events
    for each row
    execute function fm_apply_silver_event();


-- =============================================================================
-- 3. RLS：彙總表對前端唯讀
--
--    只給 select policy，不給 insert/update/delete policy，
--    所以 anon / authenticated 都無法寫入；唯一寫入者是第 2 節的 trigger。
-- =============================================================================

alter table player_game_stats  enable row level security;
alter table player_daily_stats enable row level security;
alter table daily_game_stats   enable row level security;

drop policy if exists p_pgs_read on player_game_stats;
create policy p_pgs_read on player_game_stats for select using (true);

drop policy if exists p_pds_read on player_daily_stats;
create policy p_pds_read on player_daily_stats for select using (true);

drop policy if exists p_dgs_read on daily_game_stats;
create policy p_dgs_read on daily_game_stats for select using (true);

grant select on player_game_stats, player_daily_stats, daily_game_stats to anon, authenticated;

-- silver_events 與 game_logs 同性質：前端只能 insert，不能改也不能刪。
-- （沿用 game_logs 現行的 policy 寬鬆度；本專案沒有 auth 使用者，
--   所有人都是 anon，防不了刻意作弊，只防手滑。）
alter table silver_events enable row level security;

drop policy if exists p_silver_insert on silver_events;
create policy p_silver_insert on silver_events for insert with check (true);

drop policy if exists p_silver_read on silver_events;
create policy p_silver_read on silver_events for select using (true);

grant insert, select on silver_events to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;


-- =============================================================================
-- 4. 一次性 backfill：用現有 game_logs 重建三張彙總表
--
-- ⚠️ 整段一起執行，且只執行一次。
--    先 truncate 是為了讓這段可以安全重跑（重跑 = 完全重建，而非累加）。
--    但重跑前提是 game_logs 尚未被保留期刪除過 —— 一旦第 6 節開始刪 LOG，
--    這段 backfill 就永遠不能再跑了。
--
-- ⚠️ 更要小心：truncate player_daily_stats 會連 silver_events 累加進去的
--    silver_bonus / silver_spent 一起清掉。若此時 silver_events 已經開始寫入，
--    請在 commit 之前補跑第 4.4 節，把文錢事件重新累加回去。
-- =============================================================================

begin;

truncate player_game_stats;
truncate player_daily_stats;
truncate daily_game_stats;

-- 4.1 player_game_stats
insert into player_game_stats (
    player_id, game_no, difficulty,
    play_count, win_count, best_score, best_duration_s,
    total_score, total_duration_s, last_played_at
)
select
    player_id,
    coalesce(game_no, 0),
    coalesce(difficulty, ''),
    count(*),
    count(*) filter (where coalesce(is_win, false)),
    coalesce(max(score) filter (where coalesce(is_win, false)), 0),
    min(duration_s) filter (where coalesce(is_win, false) and coalesce(duration_s, 0) > 0),
    coalesce(sum(coalesce(score, 0)), 0),
    coalesce(sum(greatest(coalesce(duration_s, 0), 0)), 0),
    max(played_at)
from game_logs
where player_id is not null and player_id <> ''
group by player_id, coalesce(game_no, 0), coalesce(difficulty, '');

-- 4.2 player_daily_stats
--     ⚠️ 舊 LOG 沒有 is_ranked，全部歸為 practice_wins（寧可少算晉升局，不要誤標）。
--     ⚠️ silver_bonus / silver_spent 無法回填 —— 領獎狀與江南小院的歷史交易
--        從未上雲，這部分歷史永久缺漏，日曆上改版前的日子只會有 silver_game。
insert into player_daily_stats (
    player_id, day, games, wins, score_sum, duration_sum,
    ranked_wins, practice_wins, silver_game
)
select
    player_id,
    (coalesce(played_at, now()) at time zone 'Asia/Taipei')::date,
    count(*),
    count(*) filter (where coalesce(is_win, false)),
    coalesce(sum(coalesce(score, 0)), 0),
    coalesce(sum(greatest(coalesce(duration_s, 0), 0)), 0),
    count(*) filter (where coalesce(is_win, false) and     coalesce(is_ranked, false)),
    count(*) filter (where coalesce(is_win, false) and not coalesce(is_ranked, false)),
    coalesce(sum(case when coalesce(is_win, false) then coalesce(score, 0) / 100 else 0 end), 0)
from game_logs
where player_id is not null and player_id <> ''
group by player_id, (coalesce(played_at, now()) at time zone 'Asia/Taipei')::date;

-- 4.3 daily_game_stats
insert into daily_game_stats (day, game_no, difficulty, wins, fails, score_sum, duration_sum)
select
    (coalesce(played_at, now()) at time zone 'Asia/Taipei')::date,
    coalesce(game_no, 0),
    coalesce(difficulty, ''),
    count(*) filter (where coalesce(is_win, false)),
    count(*) filter (where not coalesce(is_win, false)),
    coalesce(sum(coalesce(score, 0)), 0),
    coalesce(sum(greatest(coalesce(duration_s, 0), 0)), 0)
from game_logs
where player_id is not null and player_id <> ''
group by 1, 2, 3;

-- 4.4 把 silver_events 的文錢事件累加回 player_daily_stats
--     （4.2 建立的列已存在，所以這裡走 on conflict 加總；
--       若某天只有文錢事件、沒有遊戲局，則新建一列。）
insert into player_daily_stats as t (player_id, day, silver_bonus, silver_spent)
select
    player_id,
    (coalesce(occurred_at, now()) at time zone 'Asia/Taipei')::date,
    coalesce(sum(amount) filter (where amount > 0), 0),
    coalesce(-sum(amount) filter (where amount < 0), 0)
from silver_events
where player_id is not null and player_id <> ''
group by player_id, (coalesce(occurred_at, now()) at time zone 'Asia/Taipei')::date
on conflict (player_id, day) do update set
    silver_bonus = t.silver_bonus + excluded.silver_bonus,
    silver_spent = t.silver_spent + excluded.silver_spent;

commit;

-- 對帳用：以下三句的結果應與第四句（game_logs 總筆數）一致
--   select sum(play_count)   from player_game_stats;
--   select sum(games)        from player_daily_stats;
--   select sum(wins + fails) from daily_game_stats;
--   select count(*)          from game_logs where player_id is not null and player_id <> '';


-- =============================================================================
-- 5. RPC：排行榜與統計一律在資料庫端排序、限筆後才回傳
--
--    這一節同時解決舊架構的隱性 bug：
--    PostgREST 預設一次最多回 1000 列，舊的 fetchTimeBoard / fetchShortBoard
--    直接 select 全表再用 JS 加總，實際上只拿到前 1000 列，數字本來就是錯的。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 5.1 短期總分榜（日／週／月／總）
--     p_slice: 'day' | 'week' | 'month' | 'all'
--     週的起點為星期一，與舊版 sliceSince 一致。
-- -----------------------------------------------------------------------------
create or replace function get_short_board(p_slice text default 'day', p_limit int default 50)
returns table (
    player_id   text,
    nickname    text,
    global_rank text,
    total_score bigint
)
language sql
stable
as $fn$
    with bound as (
        select case lower(coalesce(p_slice, 'day'))
                   when 'day'   then (now() at time zone 'Asia/Taipei')::date
                   when 'week'  then date_trunc('week',  (now() at time zone 'Asia/Taipei'))::date
                   when 'month' then date_trunc('month', (now() at time zone 'Asia/Taipei'))::date
                   else date '1970-01-01'
               end as since
    )
    select
        d.player_id,
        coalesce(nullif(s.nickname, ''), split_part(d.player_id, '#', 1))::text,
        coalesce(s.global_rank, '書僮')::text,
        sum(d.score_sum)::bigint
    from player_daily_stats d
    cross join bound b
    left join player_saves s on s.id = d.player_id
    where d.day >= b.since
    group by d.player_id, s.nickname, s.global_rank
    having sum(d.score_sum) > 0
    order by 4 desc
    limit greatest(coalesce(p_limit, 50), 1);
$fn$;


-- -----------------------------------------------------------------------------
-- 5.2 單遊戲榜
--     p_mode: 'highScore'  （單局最高分，高→低）
--           | 'speedrun'   （最短通關秒數，低→高）
--           | 'clearCount' （累計通關次數，高→低）
--     value 一律回 bigint，前端依 mode 決定顯示成分數、時間或次數。
-- -----------------------------------------------------------------------------
create or replace function get_game_board(
    p_game_no    int,
    p_difficulty text,
    p_mode       text default 'highScore',
    p_limit      int  default 50
)
returns table (
    player_id   text,
    nickname    text,
    global_rank text,
    value       bigint,
    best_score  int,
    win_count   int
)
language sql
stable
as $fn$
    select
        g.player_id,
        coalesce(nullif(s.nickname, ''), split_part(g.player_id, '#', 1))::text,
        coalesce(s.global_rank, '書僮')::text,
        case lower(coalesce(p_mode, 'highscore'))
            when 'speedrun'   then g.best_duration_s::bigint
            when 'clearcount' then g.win_count::bigint
            else g.best_score::bigint
        end,
        g.best_score,
        g.win_count
    from player_game_stats g
    left join player_saves s on s.id = g.player_id
    where g.game_no = p_game_no
      and g.difficulty = p_difficulty
      and case lower(coalesce(p_mode, 'highscore'))
              when 'speedrun'   then g.best_duration_s is not null
              when 'clearcount' then g.win_count > 0
              else g.win_count > 0 and g.best_score > 0
          end
    order by
        -- 速通榜：秒數小者勝
        case when lower(coalesce(p_mode, 'highscore')) = 'speedrun'
             then g.best_duration_s end asc,
        -- 高分榜／累計通關榜：數字大者勝
        case when lower(coalesce(p_mode, 'highscore')) = 'speedrun'   then null
             when lower(coalesce(p_mode, 'highscore')) = 'clearcount' then g.win_count::bigint
             else g.best_score::bigint end desc,
        -- 同分以時短為勝（企劃書 B1 的規則）
        g.best_duration_s asc nulls last
    limit greatest(coalesce(p_limit, 50), 1);
$fn$;


-- -----------------------------------------------------------------------------
-- 5.3 總遊玩時長榜
-- -----------------------------------------------------------------------------
create or replace function get_time_board(p_limit int default 50)
returns table (
    player_id    text,
    nickname     text,
    global_rank  text,
    duration_sum bigint
)
language sql
stable
as $fn$
    select
        d.player_id,
        coalesce(nullif(s.nickname, ''), split_part(d.player_id, '#', 1))::text,
        coalesce(s.global_rank, '書僮')::text,
        sum(d.duration_sum)::bigint
    from player_daily_stats d
    left join player_saves s on s.id = d.player_id
    group by d.player_id, s.nickname, s.global_rank
    having sum(d.duration_sum) > 0
    order by 4 desc
    limit greatest(coalesce(p_limit, 50), 1);
$fn$;


-- -----------------------------------------------------------------------------
-- 5.4 db_viewer：每日概況（上線人數、過關／失敗局數）
-- -----------------------------------------------------------------------------
create or replace function get_daily_overview(p_from date, p_to date)
returns table (
    day     date,
    players int,
    games   bigint,
    wins    bigint,
    fails   bigint
)
language sql
stable
as $fn$
    select
        d.day,
        count(distinct d.player_id)::int,
        sum(d.games)::bigint,
        sum(d.wins)::bigint,
        (sum(d.games) - sum(d.wins))::bigint
    from player_daily_stats d
    where d.day between p_from and p_to
    group by d.day
    order by d.day;
$fn$;


-- -----------------------------------------------------------------------------
-- 5.5 db_viewer：遊戲 × 難度 統計
--     前端可再自行 group 成「每遊戲」「每難度」兩張圖，不必另開 RPC。
-- -----------------------------------------------------------------------------
create or replace function get_game_diff_stats(p_from date, p_to date)
returns table (
    game_no      int,
    difficulty   text,
    wins         bigint,
    fails        bigint,
    score_sum    bigint,
    duration_sum bigint
)
language sql
stable
as $fn$
    select
        g.game_no,
        g.difficulty,
        sum(g.wins)::bigint,
        sum(g.fails)::bigint,
        sum(g.score_sum)::bigint,
        sum(g.duration_sum)::bigint
    from daily_game_stats g
    where g.day between p_from and p_to
    group by g.game_no, g.difficulty
    order by g.game_no, g.difficulty;
$fn$;


-- -----------------------------------------------------------------------------
-- 5.6 db_viewer：玩家排名統計
--     對應「玩家總局數排名」「玩家總積分排名」兩張圖（各取前 30 名）。
--     排序一律以局數為主；積分排名由前端依 score_sum 再排一次即可，
--     不必為了兩張圖開兩個 RPC。
-- -----------------------------------------------------------------------------
create or replace function get_player_rank_stats(p_from date, p_to date, p_limit int default 30)
returns table (
    player_id text,
    nickname  text,
    games     bigint,
    wins      bigint,
    fails     bigint,
    score_sum bigint
)
language sql
stable
as $fn$
    select
        d.player_id,
        coalesce(nullif(s.nickname, ''), split_part(d.player_id, '#', 1))::text,
        sum(d.games)::bigint,
        sum(d.wins)::bigint,
        (sum(d.games) - sum(d.wins))::bigint,
        sum(d.score_sum)::bigint
    from player_daily_stats d
    left join player_saves s on s.id = d.player_id
    where d.day between p_from and p_to
    group by d.player_id, s.nickname
    order by sum(d.games) desc
    limit greatest(coalesce(p_limit, 30), 1);
$fn$;


-- -----------------------------------------------------------------------------
-- 5.7 玩家遊戲日曆
--     一次撈一個月（最多 31 列），前端左右滑動換月時再撈一次即可。
--     只回「有紀錄的天」，沒玩的日子不會有列，由前端補成米白格。
--
--     格子底色門檻（前端判斷，SQL 不介入配色）：
--       1～15 綠 / 16～30 藍 / 31～60 紅 / 61～120 紫 / 121+ 金黃
--       依據的局數 = ranked_wins + practice_wins
-- -----------------------------------------------------------------------------
create or replace function get_player_calendar(p_player_id text, p_from date, p_to date)
returns table (
    day           date,
    ranked_wins   int,
    practice_wins int,
    total_wins    int,
    score_sum     bigint,
    silver_game   int,
    silver_bonus  int,
    silver_spent  int
)
language sql
stable
as $fn$
    select
        d.day,
        d.ranked_wins,
        d.practice_wins,
        (d.ranked_wins + d.practice_wins),
        d.score_sum,
        d.silver_game,
        d.silver_bonus,
        d.silver_spent
    from player_daily_stats d
    where d.player_id = p_player_id
      and d.day between p_from and p_to
    order by d.day;
$fn$;


-- -----------------------------------------------------------------------------
-- 5.8 玩家遊戲日曆：月度合計
--     供日曆下緣的統計列，以及彈窗上緣 board-top 色條的門檻判定。
--     色條門檻（前端判斷）：
--       1+ 綠 / 225+ 藍 / 450+ 紅 / 900+ 紫 / 1800+ 金黃，依據 total_wins
-- -----------------------------------------------------------------------------
create or replace function get_player_month_summary(p_player_id text, p_from date, p_to date)
returns table (
    ranked_wins   bigint,
    practice_wins bigint,
    total_wins    bigint,
    active_days   int,
    score_sum     bigint,
    silver_game   bigint,
    silver_bonus  bigint,
    silver_spent  bigint
)
language sql
stable
as $fn$
    select
        coalesce(sum(d.ranked_wins), 0)::bigint,
        coalesce(sum(d.practice_wins), 0)::bigint,
        coalesce(sum(d.ranked_wins + d.practice_wins), 0)::bigint,
        count(*) filter (where d.ranked_wins + d.practice_wins > 0)::int,
        coalesce(sum(d.score_sum), 0)::bigint,
        coalesce(sum(d.silver_game), 0)::bigint,
        coalesce(sum(d.silver_bonus), 0)::bigint,
        coalesce(sum(d.silver_spent), 0)::bigint
    from player_daily_stats d
    where d.player_id = p_player_id
      and d.day between p_from and p_to;
$fn$;


grant execute on function
    get_short_board(text, int),
    get_game_board(int, text, text, int),
    get_time_board(int),
    get_daily_overview(date, date),
    get_game_diff_stats(date, date),
    get_player_rank_stats(date, date, int),
    get_player_calendar(text, date, date),
    get_player_month_summary(text, date, date)
to anon, authenticated;


-- =============================================================================
-- 6. 明細保留期（前端切換完成、數字比對無誤後才啟用）
--
-- ⚠️ 一旦執行過刪除，第 4 節的 backfill 就不能再跑了。
-- =============================================================================

create index if not exists idx_game_logs_played_at on game_logs (played_at);

-- Supabase 需先啟用 pg_cron：
--   create extension if not exists pg_cron;
--
-- pg_cron 的排程時間是 UTC。'0 18 * * *' = 台灣時間隔日凌晨 2:00。
-- 保留 90 天；若要改成 30 天，把 interval 換掉即可。
--
-- select cron.schedule(
--     'fm-purge-game-logs',
--     '0 18 * * *',
--     $$delete from game_logs where played_at < now() - interval '90 days'$$
-- );
--
-- 取消排程：select cron.unschedule('fm-purge-game-logs');
--
-- silver_events 同樣適用保留期（彙總已在 player_daily_stats，永久保留）：
-- select cron.schedule(
--     'fm-purge-silver-events',
--     '10 18 * * *',
--     $$delete from silver_events where occurred_at < now() - interval '90 days'$$
-- );


-- =============================================================================
-- 7. 附帶事項（待前端配合，本檔不處理）
--
-- 7.1 刪除玩家：supabaseClient.js 的 deletePlayerFromCloud 目前只刪
--     game_logs 與 player_saves，重構後必須連同 player_game_stats、
--     player_daily_stats 一起刪，否則被重置的玩家仍會留在排行榜上。
--     （daily_game_stats 不含 player_id，不需處理，也不該處理。）
--     可用下列函式，前端改呼叫一次 rpc 即可：
--
--     create or replace function delete_player_all(p_id text)
--     returns void language sql security definer set search_path = public as $$
--         delete from game_logs          where player_id = p_id;
--         delete from silver_events      where player_id = p_id;
--         delete from player_game_stats  where player_id = p_id;
--         delete from player_daily_stats where player_id = p_id;
--         delete from player_saves       where id = p_id;
--     $$;
--     ⚠️ 這是破壞性操作，是否開放給 anon key 需另行評估。
--
-- 7.2 隱身模式：leaderboard.js 的 isStealth 目前只存在 localStorage，
--     伺服器端無從得知，等於沒有生效。若要真正生效，需在 player_saves
--     加一個 stealth boolean 欄位，並在 5.1～5.3 的 RPC 加上過濾條件。
--
-- 7.4 文錢事件的前端寫入點：建議先做一個統一收口的函式再接雲端。
--     目前文錢是各處直接 `data.silver += x; save(data)`，共 9 處：
--       scoreManager.js:277   遊戲得分（+）      → 由 trigger 自行推算，不寫 silver_events
--       achievement.js:2202   領取獎狀（+）      → source='cert'
--       collection.js:1333    採收田地（+）      → source='harvest'
--       collection.js:1421    收取烘茶（+）      → source='tea'
--       collection.js:1462    開甕入庫（+）      → source='wine'
--       collection.js:1518    抄本取回（+）      → source='scribe'
--       collection.js:1742    倉庫賣出物品（+）  → source='sell'
--       collection.js:1757    購買布置物件（-）  → source='decorate'
--       collection.js:1867    考試報名費（-）    → source='exam_fee'
--     建議在 fmCollectionSave.js 加一支 addSilver(amount, source, note)，
--     由它同時做「改本機餘額 + 寫 silver_events」，上述 8 處（不含 scoreManager）
--     改呼叫它。這樣未來新增文錢來源時不會再漏記。
--
--     ⚠️ source='rank'（晉升文位本身的文錢獎勵）是確認中的既定設計，
--        但目前完全沒有實作（learningPath.js 的 showPromotionPopup 只給稱號、
--        不給文錢）。後續實作時務必同步呼叫 addSilver(amount, 'rank', station.name)，
--        否則這筆錢不會進入日曆與排行榜的彙總。詳見
--        note/玩家遊戲日曆_企劃書.md 第 5.2、5.4、9 節。
--
-- 7.5 分日時區：本次改以 Asia/Taipei 分日，與舊前端（UTC 分日）不同，
--     切換後「今日榜」與 db_viewer 的每日曲線會與舊版有小幅差異，屬正常。
-- =============================================================================
