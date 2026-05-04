import chardet

path = r'c:\3D_prj\VS_2022_prj\FlowerMoon_web\achievement.js'
raw = open(path, 'rb').read()
detected = chardet.detect(raw)
print('Detected encoding:', detected)

# Try common encodings
for enc in ['utf-8', 'utf-8-sig', 'utf-16', 'utf-16-le', 'cp950', 'big5']:
    try:
        text = raw.decode(enc)
        print(f'Success with {enc}, length={len(text)}')

        # Fix 1: remove aspect-5-8 from ach-container
        text = text.replace(
            '<div class="ach-container aspect-5-8" role="dialog" aria-modal="true">',
            '<div class="ach-container" id="achContainer" role="dialog" aria-modal="true">'
        )

        # Fix 2: add registerOverlayResize after body.appendChild(overlay)
        if 'registerOverlayResize' not in text:
            insert_marker = 'this.overlay = overlay;\n        },'
            new_block = '''this.overlay = overlay;

            /* Resize ach-container to match stage */
            var achCont = overlay.querySelector('#achContainer');
            if (window.registerOverlayResize) {
                window.registerOverlayResize(function(r) {
                    achCont.style.width  = Math.round(r.width  * 0.92) + 'px';
                    achCont.style.height = Math.round(r.height * 0.90) + 'px';
                });
            }
        },'''
            if insert_marker in text:
                text = text.replace(insert_marker, new_block, 1)
                print('Fix 2 applied')
            else:
                print('Fix 2 marker NOT found - check indentation')

        # Fix 3: remove aspect-5-8 from cert-overlay
        c3 = text.replace(
            "overlay.className = 'cert-overlay aspect-5-8';",
            "overlay.className = 'cert-overlay';"
        )
        if c3 != text:
            text = c3; print('Fix 3 applied')
        else:
            print('Fix 3 NOT found')

        # Fix 4: remove aspect-5-8 from instant-pop-overlay
        c4 = text.replace(
            "popOverlay.className = 'ach-instant-pop-overlay aspect-5-8';",
            "popOverlay.className = 'ach-instant-pop-overlay';"
        )
        if c4 != text:
            text = c4; print('Fix 4 applied')
        else:
            print('Fix 4 NOT found')

        # Fix 5: remove updateResponsiveLayout calls
        c5 = text.replace(
            'if (window.updateResponsiveLayout) window.updateResponsiveLayout();',
            '/* updateResponsiveLayout replaced by registerOverlayResize */'
        )
        if c5 != text:
            text = c5; print('Fix 5 applied')
        else:
            print('Fix 5 NOT found')

        open(path, 'w', encoding='utf-8').write(text)
        print('Saved as utf-8.')
        break
    except Exception as e:
        print(f'{enc} failed: {e}')
