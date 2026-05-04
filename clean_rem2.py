import codecs, re, os

def replacer(m):
    val = float(m.group(1))
    px_val = val * 20.0
    if px_val.is_integer():
        return f'{int(px_val)}px'
    else:
        return f'{px_val:.2f}'.rstrip('0').rstrip('.') + 'px'

css_files = [
    'c:/3D_prj/VS_2022_prj/FlowerMoon_web/achievement.css',
    'c:/3D_prj/VS_2022_prj/FlowerMoon_web/author_bio.css',
    'c:/3D_prj/VS_2022_prj/FlowerMoon_web/introCard.css',
    'c:/3D_prj/VS_2022_prj/FlowerMoon_web/poem_dialog.css'
]

for file in css_files:
    if not os.path.exists(file): continue
    try:
        with codecs.open(file, 'r', 'utf-8-sig') as f: text = f.read()
    except Exception as e:
        continue
    orig = text
    # Remove old comments we added
    text = re.sub(r'/\*\s*-?\d+(?:\.\d+)?rem\s*->\s*\d+(?:\.\d+)?px\s*\*/', '', text)
    text = re.sub(r'(-?\d+(?:\.\d+)?)\s*rem\b', replacer, text)
    if text != orig:
        with codecs.open(file, 'w', 'utf-8') as f: f.write(text)
        print('Cleaned CSS rem:', file)

js_files = [
    'c:/3D_prj/VS_2022_prj/FlowerMoon_web/achievement.js',
    'c:/3D_prj/VS_2022_prj/FlowerMoon_web/author_bio.js',
    'c:/3D_prj/VS_2022_prj/FlowerMoon_web/introCard.js',
    'c:/3D_prj/VS_2022_prj/FlowerMoon_web/poem_dialog.js'
]

for file in js_files:
    if not os.path.exists(file): continue
    try:
        with codecs.open(file, 'r', 'utf-8-sig') as f: text = f.read()
    except Exception as e:
        continue
    orig = text
    text = re.sub(r'(?<=\'|\")(-?\d+(?:\.\d+)?)\s*rem(?=\'|\")', replacer, text)
    def replacer_template(m):
        expr = m.group(1)
        if '* 20' in expr or '*20' in expr: return f'${{{expr}}}px'
        return f'${{({expr}) * 20}}px'
    text = re.sub(r'\$\{([^}]+)\}\s*rem', replacer_template, text)
    text = re.sub(r'(?<=\()(-?\d+(?:\.\d+)?)\s*rem(?=\))', replacer, text)
    text = re.sub(r'(?<=[\s,])(-?\d+(?:\.\d+)?)\s*rem(?=[\s,])', replacer, text)
    text = re.sub(r'(-?\d+(?:\.\d+)?)\s*rem\b', replacer, text)
    if text != orig:
        with codecs.open(file, 'w', 'utf-8') as f: f.write(text)
        print('Cleaned JS rem:', file)
