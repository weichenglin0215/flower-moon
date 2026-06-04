import json
import os
import re

# Parameters
# ⚠️ 2026-06 調整：原本限制 rating >= 4，現改為 1 以涵蓋全詩庫。
# 目的：讓 game21（橫批成詩）等需要「找其它詩句」的演算法
# 能利用完整字頻索引，更準確地判定「孤立字」（僅在單句中出現）。
min_rating = 1
poems_file_path = os.path.join(os.path.dirname(__file__), '../data/poems.js')
output_file_path = os.path.join(os.path.dirname(__file__), '../data/最常見詩詞字排名.js')

with open(poems_file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Extraction: find the JSON array inside POEMS
match = re.search(r'const POEMS = (\[.*\]);', content, re.DOTALL)
if not match:
    print("Could not parse POEMS")
    exit(1)

poems_json = match.group(1)
char_counts = {}

try:
    # Attempt to parse as JSON
    poems = json.loads(poems_json)
    for poem in poems:
        if poem.get('rating', 0) >= min_rating:
            for line in poem.get('content', []):
                clean_line = re.sub(r'[，。？！、：；「」『』\s]', '', line)
                for char in clean_line:
                    char_counts[char] = char_counts.get(char, 0) + 1
except json.JSONDecodeError:
    # Fallback to regex if JSON is not perfectly formatted (e.g. trailing commas)
    print("Strict JSON parsing failed, falling back to regex extraction...")
    # This regex approach is harder to filter by rating. 
    # Let's try to extract objects and check their rating.
    objs = re.findall(r'\{[^{}]*?"rating":\s*(\d+).*?"content":\s*\[(.*?)\][^{}]*?\}', content, re.DOTALL)
    for rating_str, content_str in objs:
        if int(rating_str) >= min_rating:
            lines = re.findall(r'"([^"]+)"', content_str)
            for line in lines:
                clean_line = re.sub(r'[，。？！、：；「」『』\s]', '', line)
                for char in clean_line:
                    char_counts[char] = char_counts.get(char, 0) + 1

# 將字元按出現次數降序排列，並保留次數資訊
sorted_char_data = sorted(char_counts.items(), key=lambda x: x[1], reverse=True)

with open(output_file_path, 'w', encoding='utf-8') as f:
    f.write('const CharacterFrequencyRank = [\n')
    for i, (char, count) in enumerate(sorted_char_data):
        comma = ',' if i < len(sorted_char_data) - 1 else ''
        f.write(f'  ["{char}", {count}]{comma} \n')
    f.write('];\n')

import sys
import io

# Ensure UTF-8 output for console
if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

print(f"Successfully exported {len(sorted_char_data)} frequent characters (minRating: {min_rating}) to data/最常見詩詞字排名.js")
