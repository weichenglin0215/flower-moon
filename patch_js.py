import codecs, glob, re, os

js_files = glob.glob('c:/3D_prj/VS_2022_prj/FlowerMoon_web/game*.js')
js_files += ['c:/3D_prj/VS_2022_prj/FlowerMoon_web/difficulty-selector.js',
             'c:/3D_prj/VS_2022_prj/FlowerMoon_web/level-selector.js',
             'c:/3D_prj/VS_2022_prj/FlowerMoon_web/gameMessage.js',
             'c:/3D_prj/VS_2022_prj/FlowerMoon_web/ruleNoteDialog.js']

for file in js_files:
    if not os.path.exists(file): continue
    try:
        with codecs.open(file, 'r', 'utf-8-sig') as f: text = f.read()
    except Exception as e:
        print('Error reading', file, e)
        continue

    orig = text
    # 1. Remove aspect-5-8
    text = re.sub(r'\baspect-5-8\b', '', text)
    
    # 2. Add registerOverlayResize after document.body.appendChild
    if 'registerOverlayResize' not in text:
        m = re.search(r'document\.body\.appendChild\((div|overlay|container|this\.container|ruleDialogOverlay)\);', text)
        if m:
            var_name = m.group(1)
            injection = m.group(0) + f"""
            if (window.registerOverlayResize) {{
                window.registerOverlayResize((r) => {{
                    {var_name}.style.left   = r.left   + 'px';
                    {var_name}.style.top    = r.top    + 'px';
                    {var_name}.style.width  = 500 + 'px';
                    {var_name}.style.height = 850 + 'px';
                    {var_name}.style.transform = 'scale(' + r.scale + ')';
                    {var_name}.style.transformOrigin = 'top left';
                }});
            }}"""
            text = text.replace(m.group(0), injection)

    # 3. Remove updateResponsiveLayout
    text = re.sub(r'if\s*\(\s*window\.updateResponsiveLayout\s*\)\s*window\.updateResponsiveLayout\(\);?', '/* updateResponsiveLayout replaced */', text)
    text = re.sub(r'window\.updateResponsiveLayout\(\);?', '/* updateResponsiveLayout replaced */', text)

    if text != orig:
        try:
            with codecs.open(file, 'w', 'utf-8') as f: f.write(text)
            print('Patched JS:', file)
        except Exception as e:
            print('Error writing', file, e)
