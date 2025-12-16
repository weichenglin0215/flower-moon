const fs = require('fs');
const path = 'c:/3D_prj/VS_2022_prj/FlowerMoon_web/data/poems.js';

try {
    const content = fs.readFileSync(path, 'utf8');
    // Remove 'const POEMS =' prefix and parse
    const jsonStr = content.replace(/^const\s+POEMS\s*=\s*/, '').trim().replace(/;$/, '');

    // Safety check: is it array?
    if (!jsonStr.startsWith('[')) {
        throw new Error("File format unexpected, does not start with [");
    }

    let poems = JSON.parse(jsonStr);

    console.log(`Processing ${poems.length} poems...`);
    let modifiedCount = 0;

    poems = poems.map(p => {
        if (p.content && p.line_ratings && p.line_ratings.length > p.content.length) {
            p.line_ratings = p.line_ratings.slice(0, p.content.length);
            modifiedCount++;
        }
        return p;
    });

    console.log(`Cleaned up ${modifiedCount} poems.`);

    const newContent = `const POEMS = ${JSON.stringify(poems, null, 2)};`;
    fs.writeFileSync(path, newContent);
    console.log('Done.');

} catch (err) {
    console.error('Error:', err);
}
