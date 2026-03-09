import json
import os
import re

poems_file_path = os.path.join(os.path.dirname(__file__), '../data/poems.js')
output_file_path = os.path.join(os.path.dirname(__file__), '../data/最常見詩詞字排名.js')

with open(poems_file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Very basic extraction: find the JSON array inside POEMS
match = re.search(r'const POEMS = (\[.*\]);', content, re.DOTALL)
if not match:
    print("Could not parse POEMS")
    exit(1)

poems_json = match.group(1)
try:
    # Need to handle potential JS specific syntax if any, but it looks like standard JSON
    poems = json.loads(poems_json)
except json.JSONDecodeError as e:
    print("JSON Decode Error: ", e)
    # If the JSON parsing fails because it's not strictly valid JSON, we can write a simpler parser.
    # Let's write a regular expression to extract characters directly from the string "content": [...] 
    pass
    
# Alternative regex-based approach for robustness
char_counts = {}
for po in re.findall(r'"content":\s*\[(.*?)\]', content, re.DOTALL):
    lines = re.findall(r'"([^"]+)"', po)
    for line in lines:
        clean_line = re.sub(r'[，。？！、：；「」『』\s]', '', line)
        for char in clean_line:
            char_counts[char] = char_counts.get(char, 0) + 1

sorted_chars = sorted(char_counts.keys(), key=lambda k: char_counts[k], reverse=True)

with open(output_file_path, 'w', encoding='utf-8') as f:
    f.write(f'const CharacterFrequencyRank = {json.dumps(sorted_chars, ensure_ascii=False)};\n')

print(f"Successfully exported {len(sorted_chars)} frequent characters to {output_file_path}")
