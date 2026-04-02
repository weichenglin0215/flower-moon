import random
import json
import datetime
import os
import re

# 2025-2027 節慶日期資料庫 (包含 24 節氣、傳統農曆節日與現代節日)
# 格式: {"YYYYMMDD": "節日名稱"}
FESTIVALS = {
    # 2025
    "20250101": "元旦", "20250128": "除夕", "20250129": "春節", "20250212": "元宵節",
    "20250214": "情人節", "20250401": "愚人節", "20250404": "兒童節", "20250404": "清明節",
    "20250501": "勞動節", "20250511": "母親節", "20250531": "端午節", "20250808": "父親節",
    "20250829": "七夕節", "20250906": "中元節", "20251006": "中秋節", "20251029": "重陽節",
    "20250928": "教師節",
    # 2025 節氣
    "20250203": "立春", "20250218": "雨水", "20250305": "驚蟄", "20250320": "春分",
    "20250404": "清明", "20250420": "穀雨", "20250505": "立夏", "20250521": "小滿",
    "20250605": "芒種", "20250621": "夏至", "20250707": "小暑", "20250722": "大暑",
    "20250807": "立秋", "20250823": "處暑", "20250907": "白露", "20250922": "秋分",
    "20251008": "寒露", "20251023": "霜降", "20251107": "立冬", "20251122": "小雪",
    "20251207": "大雪", "20251221": "冬至", "20250105": "小寒", "20250120": "大寒",

    # 2026
    "20260101": "元旦", "20260126": "臘八節", "20260214": "情人節", "20260215": "作者生日", 
    "20260216": "除夕", "20260217": "春節", "20260303": "元宵節", "20260401": "愚人節",
    "20260404": "兒童節", "20260405": "清明節", "20260501": "勞動節", "20260510": "母親節",
    "20260619": "端午節", "20260808": "父親節", "20260819": "七夕節", "20260827": "中元節",
    "20260925": "中秋節", "20261018": "重陽節", "20260928": "教師節",
    # 2026 節氣
    "20260204": "立春", "20260219": "雨水", "20260305": "驚蟄", "20260320": "春分",
    "20260405": "清明", "20260420": "穀雨", "20260505": "立夏", "20260521": "小滿",
    "20260605": "芒種", "20260621": "夏至", "20260707": "小暑", "20260722": "大暑",
    "20260807": "立秋", "20260823": "處暑", "20260907": "白露", "20260923": "秋分",
    "20261008": "寒露", "20261023": "霜降", "20261107": "立冬", "20261122": "小雪",
    "20261207": "大雪", "20261222": "冬至", "20260105": "小寒", "20260120": "大寒",

    # 2027
    "20270101": "元旦", "20270115": "臘八節", "20270214": "情人節", "20270205": "除夕",
    "20270206": "春節", "20270220": "元宵節", "20270401": "愚人節", "20270404": "兒童節",
    "20270405": "清明節", "20270501": "勞動節", "20270509": "母親節", "20270609": "端午節",
    "20270808": "父親節", "20270807": "七夕節", "20270816": "中元節", "20270915": "中秋節",
    "20271008": "重陽節", "20270928": "教師節",
    # 2027 節氣
    "20270204": "立春", "20270218": "雨水", "20270306": "驚蟄", "20270321": "春分",
    "20270405": "清明", "20270420": "穀雨", "20270506": "立夏", "20270521": "小滿",
    "20270606": "芒種", "20270622": "夏至", "20270707": "小暑", "20270723": "大暑",
    "20270808": "立秋", "20270823": "處暑", "20270908": "白露", "20270923": "秋分",
    "20271008": "寒露", "20271023": "霜降", "20271107": "立冬", "20271122": "小雪",
    "20271207": "大雪", "20271222": "冬至", "20270105": "小寒", "20270120": "大寒",
    # 2028
    "20280101": "元旦", "20280104": "臘八節", "20280125": "除夕", "20280126": "春節",
    "20280209": "元宵節", "20280214": "情人節", "20280401": "愚人節", "20280404": "兒童節",
    "20280404": "清明節", "20280501": "勞動節", "20280514": "母親節", "20280528": "端午節",
    "20280808": "父親節", "20280826": "七夕節", "20280903": "中元節", "20281003": "中秋節",
    "20281026": "重陽節", "20280928": "教師節",
    # 2028 節氣
    "20280106": "小寒", "20280120": "大寒", "20280204": "立春", "20280219": "雨水",
    "20280305": "驚蟄", "20280320": "春分", "20280404": "清明", "20280419": "穀雨",
    "20280505": "立夏", "20280520": "小滿", "20280605": "芒種", "20280621": "夏至",
    "20280706": "小暑", "20280722": "大暑", "20280807": "立秋", "20280822": "處暑",
    "20280907": "白露", "20280922": "秋分", "20281008": "寒露", "20281023": "霜降",
    "20281107": "立冬", "20281122": "小雪", "20281206": "大雪", "20281221": "冬至",

    # 2029
    "20290101": "元旦", "20290122": "臘八節", "20290212": "除夕", "20290213": "春節",
    "20290227": "元宵節", "20290214": "情人節", "20290401": "愚人節", "20290404": "兒童節",
    "20290404": "清明節", "20290501": "勞動節", "20290513": "母親節", "20290616": "端午節",
    "20290808": "父親節", "20290816": "七夕節", "20290824": "中元節", "20290922": "中秋節",
    "20291016": "重陽節", "20290928": "教師節",
    # 2029 節氣
    "20290105": "小寒", "20290120": "大寒", "20290203": "立春", "20290218": "雨水",
    "20290305": "驚蟄", "20290320": "春分", "20290404": "清明", "20290420": "穀雨",
    "20290505": "立夏", "20290521": "小滿", "20290605": "芒種", "20290621": "夏至",
    "20290707": "小暑", "20290722": "大暑", "20290807": "立秋", "20290823": "處暑",
    "20290907": "白露", "20290923": "秋分", "20291008": "寒露", "20291023": "霜降",
    "20291107": "立冬", "20291122": "小雪", "20291207": "大雪", "20291221": "冬至",

    # 2030
    "20300101": "元旦", "20300111": "臘八節", "20300202": "除夕", "20300203": "春節",
    "20300217": "元宵節", "20300214": "情人節", "20300401": "愚人節", "20300404": "兒童節",
    "20300405": "清明節", "20300501": "勞動節", "20300512": "母親節", "20300605": "端午節",
    "20300808": "父親節", "20300805": "七夕節", "20300813": "中元節", "20300912": "中秋節",
    "20301005": "重陽節", "20300928": "教師節",
    # 2030 節氣
    "20300105": "小寒", "20300120": "大寒", "20300204": "立春", "20300218": "雨水",
    "20300305": "驚蟄", "20300320": "春分", "20300405": "清明", "20300420": "穀雨",
    "20300505": "立夏", "20300521": "小滿", "20300605": "芒種", "20300621": "夏至",
    "20300707": "小暑", "20300723": "大暑", "20300807": "立秋", "20300823": "處暑",
    "20300907": "白露", "20300923": "秋分", "20301008": "寒露", "20301023": "霜降",
    "20301107": "立冬", "20301122": "小雪", "20301207": "大雪", "20301222": "冬至",
}

# 2025-2027 農曆十五 (月圓日) 的公曆日期
LUNAR_15TH = [
    "20250212", "20250314", "20250412", "20250512", "20250610", "20250709", "20250808", "20250906", "20251006", "20251104", "20251204", "20260103",
    "20260303", "20260401", "20260501", "20260530", "20260629", "20260728", "20260827", "20260925", "20261024", "20261123", "20261223", "20270122",
    "20270221", "20270321", "20270419", "20270519", "20270618", "20270718", "20270817", "20270915", "20271014", "20271113", "20271212", "20280111",
    "20280209", "20280310", "20280408", "20280508", "20280606", "20280706", "20280804", "20280902", "20281002", "20281101", "20281130", "20281230",
    "20290227", "20290329", "20290427", "20290527", "20290625", "20290725", "20290823", "20290922", "20291021", "20291120", "20291219", "20300118",
    "20300217", "20300318", "20300417", "20300516", "20300614", "20300714", "20300812", "20300911", "20301010", "20301109", "20301208", "20310107"
]

# 王維《終南別業》生日專屬內容 (因為 User 在 Markdown 裡寫了)
BIRTHDAY_POEM_LINES = ["行到水窮處", "坐看雲起時", "偶然值林叟", "談笑無還期"]

def parse_guideline(md_path):
    """解析 節氣、節日與詩詞的關聯.md"""
    data = {
        "festivals": {},      # 具體節日或節氣
        "months": {},         # 月份相關 (二月, 三月...)
        "moon_poems": []      # 與月亮相關 (十五日用)
    }
    if not os.path.exists(md_path):
        return data

    with open(md_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 改用更強健的全域掃描模式 (不分 Section)
    blocks = re.split(r'####\s+', content)
    known_names = ["立春", "雨水", "驚蟄", "春分", "清明", "穀雨", "立夏", "小滿", "芒種", "夏至", "小暑", "大暑", "立秋", "處暑", "白露", "秋分", "寒露", "霜降", "立冬", "小雪", "大雪", "冬至", "春節", "元宵節", "端午節", "七夕節", "中元節", "中秋節", "重陽節", "臘八節", "除夕", "元旦", "情人節", "愚人節", "兒童節", "勞動節", "母親節", "父親節", "教師節", "作者生日"]
    
    for block in blocks[1:]:
        lines = block.strip().split('\n')
        if not lines: continue
        title_line = lines[0]
        
        # 1. 檢查是否為具體節日
        detected_name = None
        for kn in known_names:
            if kn in title_line:
                detected_name = kn
                break
        
        if detected_name:
            for line in lines:
                m = re.search(r'【([^】]+)】([^《\(]+)《([^》]+)》\*\*：(.*)', line)
                if m:
                    data["festivals"][detected_name] = {"author": m.group(2).strip(), "title": m.group(3).strip(), "preset": m.group(4).strip()}
                    break
        
        # 2. 檢查是否為月份特色 (如 #### 二月)
        month_match = re.search(r'([一二三四五六七八九十]+月)', title_line)
        if month_match and "十一月" not in title_line and "十二月" not in title_line: # 避開跨月混淆
            m_name = month_match.group(1)
            if m_name not in data["months"]: data["months"][m_name] = []
            for line in lines:
                m = re.search(r'【([^】]+)】([^《\(]+)《([^》]+)》\*\*：(.*)', line)
                if m:
                    data["months"][m_name].append({"author": m.group(2).strip(), "title": m.group(3).strip(), "preset": m.group(4).strip()})

    # 3. 專門解析月亮相關 (Section V)
    moon_section = re.search(r'###.*與月亮相關.*?(?=###|$)', content, re.DOTALL)
    if moon_section:
        m_lines = moon_section.group(0).split('\n')
        for ml in m_lines:
            # 格式 1: 張九齡《望月懷遠》：...
            m1 = re.search(r'([^【】《》\s]+)《([^》]+)》[：\s]*(.*)', ml)
            if m1 and "【" not in ml:
                data["moon_poems"].append({"author": m1.group(1).strip(), "title": m1.group(2).strip(), "preset": m1.group(3).strip()})
            # 格式 2: **【唐】李白...
            m2 = re.search(r'【([^】]+)】([^《\(]+)《([^》]+)》\*\*：(.*)', ml)
            if m2:
                data["moon_poems"].append({"author": m2.group(2).strip(), "title": m2.group(3).strip(), "preset": m2.group(4).strip()})

    print(f"解析成功！節日: {len(data['festivals'])}, 月份特色: {len(data['months'])}, 月亮詩: {len(data['moon_poems'])}")
    return data

def get_best_lines_from_poem(poem_obj):
    """從詩詞物件中取出評分最高的四句，且字數不超過 8"""
    content = poem_obj.get("content", [])
    ratings = poem_obj.get("line_ratings", [])
    
    lines_with_meta = []
    for i, text in enumerate(content):
        if len(text) > 8: continue # 嚴格檢查 8 字限制
        r = ratings[i] if i < len(ratings) else 0
        lines_with_meta.append({"text": text, "rating": r, "index": i})
    
    if not lines_with_meta:
        return []
        
    # 按評分排序，取前 4，再按原順序排序
    lines_with_meta.sort(key=lambda x: x["rating"], reverse=True)
    selected = lines_with_meta[:4]
    selected.sort(key=lambda x: x["index"])
    
    return [s["text"] for s in selected]

def refresh():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    poems_file = os.path.join(base_dir, 'data', 'poems.js')
    note_file = os.path.join(base_dir, 'note', '節氣、節日與詩詞的關聯.md')
    output_file = os.path.join(base_dir, 'data', 'calendar_assignments.js')

    if not os.path.exists(poems_file):
        print(f"錯誤: 找不到 {poems_file}")
        return

    # 1. 讀取與解析原始 POEMS
    print(f"正在讀取 {poems_file}...")
    with open(poems_file, 'r', encoding='utf-8') as f:
        content = f.read()

    # 提取 JS 常數 POEMS 後方的 [ ... ] 部分
    json_part_match = re.search(r'const POEMS = (\[.*\]);', content, re.DOTALL)
    if not json_part_match:
        print("錯誤: 無法解析 POEMS 結構")
        return
    
    try:
        # 使用 json 加載，但需處理可能存在的結尾逗號或單引號 (基本清潔)
        cleaned_json = json_part_match.group(1)
        # 移除一些常見的非標準 JSON 格式
        cleaned_json = re.sub(r',\s*\]', ']', cleaned_json)
        cleaned_json = re.sub(r',\s*\}', '}', cleaned_json)
        poems_db = json.loads(cleaned_json)
    except Exception as e:
        print(f"JSON 解析失敗，嘗試極简提取模式... ({e})")
        # 降級方案：使用簡單的正則（原邏輯優化）
        poems_db = []
        blocks = re.findall(r'\{[^{}]+\}', cleaned_json)
        for b in blocks:
            try:
                p_id = int(re.search(r'"id":\s*(\d+)', b).group(1))
                p_author = re.search(r'"author":\s*"([^"]+)"', b).group(1)
                p_title = re.search(r'"title":\s*"([^"]+)"', b).group(1)
                p_rating = int(re.search(r'"rating":\s*(\d+)', b).group(1))
                p_content = json.loads(re.search(r'"content":\s*(\[[^\]]+\])', b).group(1))
                p_ratings = json.loads(re.search(r'"line_ratings":\s*(\[[^\]]+\])', b).group(1))
                poems_db.append({"id": p_id, "author": p_author, "title": p_title, "rating": p_rating, "content": p_content, "line_ratings": p_ratings})
            except: continue

    # 2. 準備通用詩池 (Rating >= 4 且滿足 8 字限制)
    general_pool = []
    for p in poems_db:
        if p.get("rating", 0) >= 4:
            # 檢查內容是否至少有四句能用 (每行 <= 8)
            available_lines = [line for line in p.get("content", []) if len(line) <= 8]
            if len(available_lines) >= 4:
                general_pool.append(p["id"])

    # 3. 解析建議手冊
    guidelines = parse_guideline(note_file)

    # 4. 開始分配
    assignments = {}
    last_90_ids = []
    
    # 使用固定種子確保每次運行一致
    random.seed(999)
    
    current_date = datetime.date(2025, 1, 1)
    end_date = datetime.date(2030, 12, 31)

    while current_date <= end_date:
        date_key = current_date.strftime("%Y%m%d")
        festival_name = FESTIVALS.get(date_key)
        month_in_chinese = ["", "一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"][current_date.month]
        
        assigned_val = None
        
        # 建立優先順序清單 (候選詩詞)
        candidates = []
        
        # 優先順序 1: 作者生日
        if date_key[4:] == "0215":
            p_found = next((p for p in poems_db if p["id"] == 133), None)
            if p_found:
                assigned_val = [p_found["id"], None] + BIRTHDAY_POEM_LINES

        # 優先順序 2: 具體節日或節氣 (來自 FESTIVALS)
        if not assigned_val and festival_name:
            guide = guidelines["festivals"].get(festival_name)
            if guide:
                p_found = next((p for p in poems_db if guide["title"] == p["title"] and guide["author"] == p["author"]), None)
                if not p_found:
                    p_found = next((p for p in poems_db if guide["title"][:2] in p["title"] and guide["author"] in p["author"]), None)
                if p_found:
                    best_lines = get_best_lines_from_poem(p_found)
                    if guide["preset"]:
                        md_lines = [l.strip() for l in re.split(r'[，。；？！]', guide["preset"]) if l.strip()]
                        # 去重合併
                        seen = set(md_lines)
                        extra = [l for l in best_lines if l not in seen]
                        best_lines = (md_lines + extra)[:4]
                    assigned_val = [p_found["id"], festival_name] + [l[:8] for l in best_lines]

        # 優先順序 3: 農曆十五 (月亮詩)
        if not assigned_val and date_key in LUNAR_15TH:
            random.seed(int(date_key)) # 十五日的詩在不同年分可隨機但需固定
            moon_guides = guidelines["moon_poems"]
            if moon_guides:
                # 排除最近 90 天用過的 ID
                available_moon = []
                for mg in moon_guides:
                    p = next((p for p in poems_db if mg["title"] in p["title"] and mg["author"] in p["author"]), None)
                    if p and p["id"] not in last_90_ids:
                        available_moon.append((mg, p))
                
                if not available_moon: # 萬一都用過了，放寬限制
                    available_moon = [(mg, next((p for p in poems_db if mg["title"] in p["title"] and mg["author"] in p["author"]), None)) for mg in moon_guides]
                    available_moon = [(mg, p) for mg, p in available_moon if p is not None]

                if available_moon:
                    mg, p_found = random.choice(available_moon)
                    best_lines = get_best_lines_from_poem(p_found)
                    if mg["preset"]:
                        md_lines = [l.strip() for l in re.split(r'[，。；？！]', mg["preset"]) if l.strip()]
                        seen = set(md_lines)
                        extra = [l for l in best_lines if l not in seen]
                        best_lines = (md_lines + extra)[:4]
                    assigned_val = [p_found["id"], "月圓"] + [l[:8] for l in best_lines]

        # 優先順序 4: 月份特色詩 (Section IV)
        if not assigned_val and month_in_chinese in guidelines["months"]:
            month_guides = guidelines["months"][month_in_chinese]
            random.seed(int(date_key))
            # 隨機從月份建議中挑一個，但不要每天都挑 (例如每個月的前幾天或隨機幾天)
            # 為了讓月份特色均勻分佈，我們設定 20% 的機率在一般日子出現月份特色詩
            if random.random() < 0.2:
                available_month = []
                for mg in month_guides:
                    p = next((p for p in poems_db if mg["title"] in p["title"] and mg["author"] in p["author"]), None)
                    if p and p["id"] not in last_90_ids:
                        available_month.append((mg, p))
                
                if available_month:
                    mg, p_found = random.choice(available_month)
                    best_lines = get_best_lines_from_poem(p_found)
                    if mg["preset"]:
                        md_lines = [l.strip() for l in re.split(r'[，。；？！]', mg["preset"]) if l.strip()]
                        seen = set(md_lines)
                        extra = [l for l in best_lines if l not in seen]
                        best_lines = (md_lines + extra)[:4]
                    assigned_val = [p_found["id"], month_in_chinese] + [l[:8] for l in best_lines]

        # 優先順序 5: 一般詩池
        if assigned_val is None:
            valid_candidates = [pid for pid in general_pool if pid not in last_90_ids]
            if not valid_candidates:
                valid_candidates = general_pool
            
            picked_id = random.choice(valid_candidates)
            assigned_val = picked_id

        # 更新狀態
        if isinstance(assigned_val, list):
            last_90_ids.append(assigned_val[0])
        else:
            last_90_ids.append(assigned_val)
            
        if len(last_90_ids) > 90: last_90_ids.pop(0)

        assignments[date_key] = assigned_val
        current_date += datetime.timedelta(days=1)

    # 5. 輸出產出
    print(f"寫入結果至 {output_file}...")
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write("/**\n")
        f.write(" * 自動生成的日曆詩詞分配表 (2025-2027)\n")
        f.write(" * 每次修改 poems.js 或 節氣文件後，請執行此腳本重新產生\n")
        f.write(" */\n")
        f.write("const CALENDAR_ASSIGNMENTS = {\n")
        
        # 為了美觀與編輯方便，我們手動格式化每一行
        total = len(assignments)
        for i, (dk, val) in enumerate(sorted(assignments.items())):
            comma = "," if i < total - 1 else ""
            if isinstance(val, list):
                # 節日格式: "20260101": [ID, "Label", "L1", "L2", "L3", "L4"],
                id_str = f"{val[0]},"
                label_str = f' "{val[1]}",' if val[1] else " null,"
                lines_str = ", ".join([f'"{l}"' for l in val[2:]])
                f.write(f'  "{dk}": [{id_str}{label_str} {lines_str}]{comma}\n')
            else:
                # 一般格式: "20260101": ID,
                f.write(f'  "{dk}": {val}{comma}\n')
        
        f.write("};\n")

    print(f"成功！已重新產生 {output_file}")

if __name__ == "__main__":
    refresh()
