import random
import json
import datetime
import os
import re

def refresh():
    # 1. 路徑設定
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    poems_file = os.path.join(base_dir, 'data', 'poems.js')
    output_file = os.path.join(base_dir, 'data', 'calendar_assignments.js')

    if not os.path.exists(poems_file):
        print(f"錯誤: 找不到 {poems_file}")
        return

    # 2. 讀取並手動解析 poems.js (不依賴 JS 執行環境)
    print(f"正在讀取 {poems_file}...")
    with open(poems_file, 'r', encoding='utf-8') as f:
        content = f.read()

    # 簡單的正則表達式提取 id 和 rating
    # 這裡假設結構為 { "id": 1, ..., "rating": 4, ... }
    # 我們按區塊匹配每個物件
    poem_blocks = re.findall(r'\{[^{}]*\}', content)
    
    poems_pool = []
    for block in poem_blocks:
        id_match = re.search(r'"id":\s*(\d+)', block)
        rating_match = re.search(r'"rating":\s*(\d+)', block)
        
        if id_match and rating_match:
            p_id = int(id_match.group(1))
            p_rating = int(rating_match.group(1))
            if p_rating >= 4:
                poems_pool.append(p_id)

    if not poems_pool:
        print("警告: 沒有符合評分標準 (>=4) 的詩詞。")
        return

    print(f"符合標準的詩詞總數: {len(poems_pool)}")

    # 3. 洗牌 (使用固定種子確保一致性)
    random.seed(999)
    random.shuffle(poems_pool)

    # 4. 生成 2025-2027 年份日期對應表
    assignments = {}
    current_date = datetime.date(2025, 1, 1)
    end_date = datetime.date(2027, 12, 31)
    
    day_offset = 0
    while current_date <= end_date:
        date_key = current_date.strftime("%Y%m%d")
        poem_id = poems_pool[day_offset % len(poems_pool)]
        assignments[date_key] = poem_id
        
        current_date += datetime.timedelta(days=1)
        day_offset += 1

    # 5. 寫入結果
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write("/**\n")
        f.write(" * 自動生成的日曆詩詞分配表 (2025-2027)\n")
        f.write(" * 每次修改 poems.js 後，請執行 tools/refresh_assignments.py 重新產生此檔案\n")
        f.write(" */\n")
        f.write("const CALENDAR_ASSIGNMENTS = ")
        f.write(json.dumps(assignments, indent=2))
        f.write(";\n")

    print(f"成功！已重新產生 {output_file}")
    print(f"分配日期範圍: 2025-01-01 到 2027-12-31")

if __name__ == "__main__":
    refresh()
