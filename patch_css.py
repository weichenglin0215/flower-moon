import codecs, glob, re, os

css_files = glob.glob('c:/3D_prj/VS_2022_prj/FlowerMoon_web/game*.css')
css_files += ['c:/3D_prj/VS_2022_prj/FlowerMoon_web/difficulty-selector.css',
              'c:/3D_prj/VS_2022_prj/FlowerMoon_web/level-selector.css',
              'c:/3D_prj/VS_2022_prj/FlowerMoon_web/gameMessage.css',
              'c:/3D_prj/VS_2022_prj/FlowerMoon_web/ruleNoteDialog.css']

# The classes that need positioning fixes
overlay_classes = [f'\.game{i}-overlay' for i in range(1, 15)] + [
    r'\.difficulty-selector-overlay',
    r'\.level-selector-overlay',
    r'\.common-game-message',
    r'\.rule-note-overlay',
    r'\.rule-note-dialog'
]

def process_css(file_path):
    if not os.path.exists(file_path): return
    try:
        with codecs.open(file_path, 'r', 'utf-8-sig') as f: text = f.read()
    except Exception:
        try:
            # game2.css failed with cp950 before, maybe we can read it ignoring errors
            with codecs.open(file_path, 'r', 'utf-8', errors='ignore') as f: text = f.read()
        except Exception as e:
            print('Cannot read', file_path, e)
            return

    orig = text
    
    for cls in overlay_classes:
        # Find the block for the class
        pattern = re.compile(f'({cls}(?:\s*,\s*\S+)*\s*{{)([^}}]+)', re.MULTILINE)
        
        def replacer(match):
            header = match.group(1)
            body = match.group(2)
            
            # Add positioning if missing
            if 'position: fixed' not in body and 'position:fixed' not in body:
                # Replace 'position: absolute' if exists
                body = re.sub(r'position:\s*absolute;?', '', body)
                body = '\n    position: fixed;\n    top: 0;\n    left: 0;\n    margin: 0;' + body
            
            # Remove bad styles
            body = re.sub(r'top:\s*50%;?', '', body)
            body = re.sub(r'left:\s*50%;?', '', body)
            body = re.sub(r'transform:\s*translate\([^)]+\);?', '', body)
            
            return header + body
            
        text = pattern.sub(replacer, text)
        
    if text != orig:
        with codecs.open(file_path, 'w', 'utf-8') as f: f.write(text)
        print('Patched CSS:', file_path)

for file in css_files:
    process_css(file)

