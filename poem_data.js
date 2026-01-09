document.addEventListener('DOMContentLoaded', () => {
    let currentPoemIndex = 0;
    const poemDisplay = document.getElementById('poem-display');
    const template = document.getElementById('poemTemplate');

    // Initialize
    if (typeof POEMS !== 'undefined' && POEMS.length > 0) {
        // Check URL params for specific poem
        const urlParams = new URLSearchParams(window.location.search);
        const poemId = urlParams.get('id');

        if (poemId) {
            const index = POEMS.findIndex(p => p.id == poemId);
            if (index !== -1) {
                currentPoemIndex = index;
            }
        } else {
            // Random start if no ID provided
            currentPoemIndex = Math.floor(Math.random() * POEMS.length);
        }

        renderPoem(currentPoemIndex);
        setupControls();
    } else {
        poemDisplay.innerHTML = '<div class="error">資料載入失敗</div>';
    }

    function renderPoem(index) {
        const poem = POEMS[index];
        const clone = template.content.cloneNode(true);

        // Fill data
        clone.querySelector('.poem-type').textContent = poem.type || '詩詞';
        clone.querySelector('.poem-title').textContent = poem.title || '無題';
        clone.querySelector('.poem-dynasty').textContent = poem.dynasty || '';
        clone.querySelector('.poem-author').textContent = poem.author || '佚名';

        // Content
        const contentDiv = clone.querySelector('.poem-content');
        if (poem.content && Array.isArray(poem.content)) {
            poem.content.forEach(line => {
                const p = document.createElement('div');
                p.className = 'poem-line';
                p.textContent = line;
                contentDiv.appendChild(p);
            });
        }

        // Review
        const reviewSection = clone.querySelector('.review-section');
        if (reviewSection) {
            const reviewDiv = reviewSection.querySelector('.poem-review');
            if (poem.rating) {
                reviewDiv.textContent = poem.rating;
            } else {
                reviewDiv.innerHTML = '<p class="placeholder-text">（暫無總評）</p>';
            }
        }

        // Famous Lines (Rating >= 3)
        const famousLinesDiv = clone.querySelector('.famous-lines');
        let hasFamousLines = false;

        if (poem.content && poem.line_ratings) {
            poem.content.forEach((line, i) => {
                if (poem.line_ratings[i] >= 3) {
                    const div = document.createElement('div');
                    div.className = 'famous-line-item';
                    div.textContent = line;
                    famousLinesDiv.appendChild(div);
                    hasFamousLines = true;
                }
            });
        }

        if (!hasFamousLines) {
            famousLinesDiv.innerHTML = '<p class="placeholder-text">此詩尚無評分較高的佳句。</p>';
        }

        // Zhuyin
        const phoneticSection = clone.querySelector('.phonetic-section');
        if (poem.zhuyin) {
            const h2 = phoneticSection.querySelector('h2');
            phoneticSection.innerHTML = '';
            phoneticSection.appendChild(h2);

            const p = document.createElement('div');
            p.className = 'zhuyin-content';
            p.textContent = poem.zhuyin;
            phoneticSection.appendChild(p);
        } else {
            const h2 = phoneticSection.querySelector('h2');
            phoneticSection.innerHTML = '';
            phoneticSection.appendChild(h2);
            const p = document.createElement('p');
            p.className = 'placeholder-text';
            p.textContent = '（暫無注音）';
            phoneticSection.appendChild(p);
        }

        // Clear and append
        poemDisplay.innerHTML = '';
        poemDisplay.appendChild(clone);

        // Update URL without reloading (optional, good for sharing)
        const url = new URL(window.location);
        url.searchParams.set('id', poem.id);
        window.history.replaceState({}, '', url);
    }

    function setupControls() {
        document.getElementById('prevBtn').addEventListener('click', () => {
            currentPoemIndex = (currentPoemIndex - 1 + POEMS.length) % POEMS.length;
            renderPoem(currentPoemIndex);
        });

        document.getElementById('nextBtn').addEventListener('click', () => {
            currentPoemIndex = (currentPoemIndex + 1) % POEMS.length;
            renderPoem(currentPoemIndex);
        });

        document.getElementById('randomBtn').addEventListener('click', () => {
            let newIndex;
            do {
                newIndex = Math.floor(Math.random() * POEMS.length);
            } while (newIndex === currentPoemIndex && POEMS.length > 1);

            currentPoemIndex = newIndex;
            renderPoem(currentPoemIndex);
        });
    }
});
