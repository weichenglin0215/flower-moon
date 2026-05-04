import glob, codecs, re, os

js_files = glob.glob('c:/3D_prj/VS_2022_prj/FlowerMoon_web/game*.js')
js_files += ['c:/3D_prj/VS_2022_prj/FlowerMoon_web/difficulty-selector.js',
             'c:/3D_prj/VS_2022_prj/FlowerMoon_web/level-selector.js',
             'c:/3D_prj/VS_2022_prj/FlowerMoon_web/gameMessage.js',
             'c:/3D_prj/VS_2022_prj/FlowerMoon_web/ruleNoteDialog.js']

def replacer_string(m):
    val = float(m.group(1))
    px_val = val * 20.0
    if px_val.is_integer():
        px_str = str(int(px_val))
    else:
        px_str = f"{px_val:.2f}".rstrip('0').rstrip('.')
    return f"{px_str}px"

def replacer_template(m):
    expr = m.group(1)
    # Be careful, if it already has * 20 we don't multiply again
    if '* 20' in expr:
        return f"${{{expr}}}px"
    return f"${{({expr}) * 20}}px"

def replacer_translate(m):
    # For translate(${dx}rem, ${dy}rem)
    return m.group(0).replace('rem', '*20}px').replace('${', '${(').replace('}*20}px', ') * 20}px')

for file in js_files:
    if not os.path.exists(file): continue
    try:
        with codecs.open(file, 'r', 'utf-8-sig') as f: text = f.read()
    except:
        continue
        
    orig = text
    
    # 1. string literals like '3rem', "0.2rem"
    text = re.sub(r'(?<=\'|\")(-?\d+(?:\.\d+)?)\s*rem(?=\'|\")', replacer_string, text)
    
    # 2. Template literals like ${baseSize}rem
    text = re.sub(r'\$\{([^}]+)\}\s*rem', replacer_template, text)
    
    # 3. Inside transforms like translateY(-1.5rem)
    text = re.sub(r'(?<=\()(-?\d+(?:\.\d+)?)\s*rem(?=\))', replacer_string, text)
    
    # 4. In game14: translate3d(0, 15rem, -100px)
    text = re.sub(r'(?<=[\s,])(-?\d+(?:\.\d+)?)\s*rem(?=[\s,])', replacer_string, text)
    
    # 5. html attributes like style="margin: 0.1rem 0"
    text = re.sub(r'(?<=[:\s\-])(-?\d+(?:\.\d+)?)\s*rem\b', replacer_string, text)

    if text != orig:
        with codecs.open(file, 'w', 'utf-8') as f: f.write(text)
        print('Converted JS:', file)
