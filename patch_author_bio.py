import re

path = r'c:\3D_prj\VS_2022_prj\FlowerMoon_web\author_bio.js'
text = open(path, encoding='utf-8').read()

# Fix 1: remove aspect-5-8
text = text.replace(
    "page.className = 'author_bio-overlay aspect-5-8 hidden';",
    "page.className = 'author_bio-overlay hidden'; /* removed aspect-5-8, repositioned by registerOverlayResize */"
)

# Fix 2: add registerOverlayResize block after appendChild
insert_after = "        document.body.appendChild(page);"
register_block = """

        /* Track stage position/size */
        if (window.registerOverlayResize) {
            window.registerOverlayResize(function(r) {
                page.style.left   = r.left   + 'px';
                page.style.top    = r.top    + 'px';
                page.style.width  = r.width  + 'px';
                page.style.height = r.height + 'px';
            });
        }"""

# Only insert once
if 'registerOverlayResize' not in text:
    text = text.replace(insert_after, insert_after + register_block, 1)

# Fix 3: remove updateResponsiveLayout call
text = text.replace(
    "if (window.updateResponsiveLayout) window.updateResponsiveLayout();",
    "/* updateResponsiveLayout replaced by registerOverlayResize */"
)

open(path, 'w', encoding='utf-8').write(text)
print("Done:", path)
