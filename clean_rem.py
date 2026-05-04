import glob, codecs, re, os

def replacer(m):
    val = float(m.group(1))
    px_val = val * 20.0
    if px_val.is_integer():
        return f'{int(px_val)}px'
    else:
        return f'{px_val:.2f}'.rstrip('0').rstrip('.') + 'px'

# 1. Update CSS files
css_files = glob.glob('c:/3D_prj/VS_2022_prj/FlowerMoon_web/game*.css')
css_files += ['c:/3D_prj/VS_2022_prj/FlowerMoon_web/difficulty-selector.css',
              'c:/3D_prj/VS_2022_prj/FlowerMoon_web/level-selector.css',
              'c:/3D_prj/VS_2022_prj/FlowerMoon_web/gameMessage.css',
              'c:/3D_prj/VS_2022_prj/FlowerMoon_web/ruleNoteDialog.css',
              'c:/3D_prj/VS_2022_prj/FlowerMoon_web/menu.css']

for file in css_files:
    if not os.path.exists(file): continue
    try:
        with codecs.open(file, 'r', 'utf-8-sig') as f: text = f.read()
    except Exception as e:
        print('Error', file, e)
        continue
    
    orig = text
    # Remove old comments we added /* Xrem -> Ypx */
    text = re.sub(r'/\*\s*-?\d+(?:\.\d+)?rem\s*->\s*\d+(?:\.\d+)?px\s*\*/', '', text)
    
    # Just convert rem to px cleanly without comments
    # Look for number followed by rem, ignoring if it's already converted (but wait, previous script added comments, so numbers might be converted already!
    # Ah! If the previous script DID convert it, `padding: 2px /* 0.1rem -> 2px */ 8px /* 0.4rem -> 8px */;`
    # Let's completely read the ORIGINAL files from git or just fix what we have?
    # Wait, the user showed: `padding: 0.1rem 0.4rem;` which means the previous script DID NOT MATCH IT!
    # Why? `(?<=[:\s\-])` matches space, but `0.1rem` is after a space, and `0.4rem` is after a space. It should have matched!
    # Let's just use `r'(-?\d+(?:\.\d+)?)\s*rem\b'` without lookbehind!
    text = re.sub(r'(-?\d+(?:\.\d+)?)\s*rem\b', replacer, text)
    if text != orig:
        with codecs.open(file, 'w', 'utf-8') as f: f.write(text)
        print('Cleaned CSS rem:', file)

# 2. Update JS files similarly for strings
js_files = glob.glob('c:/3D_prj/VS_2022_prj/FlowerMoon_web/game*.js')
js_files += ['c:/3D_prj/VS_2022_prj/FlowerMoon_web/difficulty-selector.js',
             'c:/3D_prj/VS_2022_prj/FlowerMoon_web/level-selector.js',
             'c:/3D_prj/VS_2022_prj/FlowerMoon_web/gameMessage.js',
             'c:/3D_prj/VS_2022_prj/FlowerMoon_web/ruleNoteDialog.js',
             'c:/3D_prj/VS_2022_prj/FlowerMoon_web/menu.js']

for file in js_files:
    if not os.path.exists(file): continue
    try:
        with codecs.open(file, 'r', 'utf-8-sig') as f: text = f.read()
    except Exception as e:
        continue
        
    orig = text
    # Clean rem to px in strings
    text = re.sub(r'(?<=\'|\")(-?\d+(?:\.\d+)?)\s*rem(?=\'|\")', replacer, text)
    # Inside templates 
    def replacer_template(m):
        expr = m.group(1)
        if '* 20' in expr or '*20' in expr: return f'${{{expr}}}px'
        return f'${{({expr}) * 20}}px'
    text = re.sub(r'\$\{([^}]+)\}\s*rem', replacer_template, text)
    # Inside translates
    text = re.sub(r'(?<=\()(-?\d+(?:\.\d+)?)\s*rem(?=\))', replacer, text)
    text = re.sub(r'(?<=[\s,])(-?\d+(?:\.\d+)?)\s*rem(?=[\s,])', replacer, text)
    # html attributes
    text = re.sub(r'(-?\d+(?:\.\d+)?)\s*rem\b', replacer, text)
    
    if text != orig:
        with codecs.open(file, 'w', 'utf-8') as f: f.write(text)
        print('Cleaned JS rem:', file)
