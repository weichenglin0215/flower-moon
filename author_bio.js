/* author_bio.js */

window.AuthorBio = (function () {
    let allAuthors = []; // { name, dynasty, totalRating, poems: [] }
    let filteredAuthors = [];
    let selectedAuthor = null;
    let currentSort = 'rating'; // 'rating' or 'text'
    let dynasties = [];
    let surnames = [];

    function init() {
        if (typeof POEMS === 'undefined') {
            console.error('POEMS data not found');
            return;
        }

        processData();
        createUI();
        updateAuthorList();
    }

    function processData() {
        const authorMap = new Map();
        const dynastySet = new Set();
        const surnameSet = new Set();

        POEMS.forEach(poem => {
            const name = poem.author || '佚名';
            const dynasty = poem.dynasty || '未知';
            dynastySet.add(dynasty);

            // Extract surname (first char usually)
            if (name !== '佚名' && name !== '詩經') {
                surnameSet.add(name.charAt(0));
            }

            if (!authorMap.has(name)) {
                authorMap.set(name, {
                    name: name,
                    dynasty: dynasty,
                    totalRating: 0,
                    poems: []
                });
            }
            const authorData = authorMap.get(name);
            authorData.totalRating += (poem.rating || 0);
            authorData.poems.push(poem);
        });

        allAuthors = Array.from(authorMap.values());
        dynasties = Array.from(dynastySet).sort();
        surnames = Array.from(surnameSet).sort();

        filteredAuthors = [...allAuthors];
        sortAuthorsByRating();
    }

    function sortAuthorsByRating() {
        allAuthors.sort((a, b) => b.totalRating - a.totalRating);
    }

    function createUI() {
        const page = document.createElement('div');
        page.id = 'authorBioPage';
        //檢查responsive.css是否有包括game4 - overlay.aspect - 5 - 8
        page.className = 'author_bio-overlay aspect-5-8 hidden';
        page.innerHTML = `
            <div class="page-close-btn">&times;</div>
            <div class="bio-header">
                <div class="filter-group">
                    <label>朝代選擇</label>
                    <select id="dynastyFilter">
                        <option value="all">所有朝代</option>
                        ${dynasties.map(d => `<option value="${d}">${d}</option>`).join('')}
                    </select>
                </div>
                <div class="filter-group">
                    <label>姓氏選擇</label>
                    <select id="surnameFilter">
                        <option value="all">所有姓氏</option>
                        ${surnames.map(s => `<option value="${s}">${s}</option>`).join('')}
                    </select>
                </div>
                <div class="filter-group">
                    <label>輸入選擇 (人名/詩句)</label>
                    <input type="text" id="bioSearch" placeholder="搜尋...">
                </div>
            </div>
            <div class="bio-content">
                <div class="author-list-container">
                    <div class="list-title">
                        <span>作者列表</span>
                        <span id="authorCount" style="font-size: 0.8rem; opacity: 0.7;"></span>
                    </div>
                    <div class="author-scroll" id="authorList"></div>
                </div>
                <div class="works-list-container">
                    <div class="list-title">作品列表</div>
                    <div class="works-controls">
                        <button class="sort-btn active" data-sort="rating">依評價排序</button>
                        <button class="sort-btn" data-sort="text">依名稱排序</button>
                    </div>
                    <div class="works-scroll" id="worksList">
                        <div style="padding: 20px; text-align: center; opacity: 0.5;">請選擇一位作者</div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(page);

        // Events
        page.querySelector('.page-close-btn').addEventListener('click', hide);

        document.getElementById('dynastyFilter').addEventListener('change', applyFilters);
        document.getElementById('surnameFilter').addEventListener('change', applyFilters);
        document.getElementById('bioSearch').addEventListener('input', applyFilters);

        const sortBtns = page.querySelectorAll('.sort-btn');
        sortBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                sortBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentSort = btn.dataset.sort;
                if (selectedAuthor) updateWorksList();
            });
        });
    }

    function applyFilters() {
        const dynasty = document.getElementById('dynastyFilter').value;
        const surname = document.getElementById('surnameFilter').value;
        const query = document.getElementById('bioSearch').value.toLowerCase();

        filteredAuthors = allAuthors.filter(author => {
            const matchesDynasty = dynasty === 'all' || author.dynasty === dynasty;
            const matchesSurname = surname === 'all' || author.name.startsWith(surname);

            let matchesQuery = true;
            if (query) {
                const nameMatches = author.name.toLowerCase().includes(query);
                const poemMatches = author.poems.some(p =>
                    p.title.toLowerCase().includes(query) ||
                    p.content.some(line => line.toLowerCase().includes(query))
                );
                matchesQuery = nameMatches || poemMatches;
            }

            return matchesDynasty && matchesSurname && matchesQuery;
        });

        updateAuthorList();
    }

    function updateAuthorList() {
        const list = document.getElementById('authorList');
        const countSpan = document.getElementById('authorCount');
        countSpan.textContent = `共 ${filteredAuthors.length} 位`;

        list.innerHTML = filteredAuthors.map(author => `
            <div class="author-item ${selectedAuthor && selectedAuthor.name === author.name ? 'selected' : ''}" data-name="${author.name}">
                <div class="author-name">${author.name} <span style="font-size: 0.7rem; font-weight: normal; opacity: 0.6;">(${author.dynasty})</span></div>
                <div class="author-stats">總評分: ${author.totalRating} | 作品: ${author.poems.length}</div>
            </div>
        `).join('');

        // Re-attach click events
        list.querySelectorAll('.author-item').forEach(item => {
            item.addEventListener('click', () => {
                const name = item.dataset.name;
                selectedAuthor = allAuthors.find(a => a.name === name);

                // Update UI state
                list.querySelectorAll('.author-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');

                updateWorksList();
            });
        });
    }

    function updateWorksList() {
        const list = document.getElementById('worksList');
        if (!selectedAuthor) return;

        let sortedPoems = [...selectedAuthor.poems];
        if (currentSort === 'rating') {
            sortedPoems.sort((a, b) => b.rating - a.rating);
        } else {
            sortedPoems.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hant'));
        }

        list.innerHTML = sortedPoems.map(poem => `
            <div class="work-item" data-id="${poem.id}">
                <div class="work-header">
                    <span class="work-title">${poem.title}</span>
                    <span class="work-rating">評價: ${poem.rating}</span>
                </div>
                <div class="work-snippet">${poem.content[0]}...</div>
            </div>
        `).join('');

        list.querySelectorAll('.work-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = item.dataset.id;
                if (window.openPoemDialogById) {
                    window.openPoemDialogById(id);
                }
            });
        });
    }

    function show() {
        let page = document.getElementById('authorBioPage');
        if (!page && typeof POEMS !== 'undefined') {
            init();
            page = document.getElementById('authorBioPage');
        }
        if (page) {
            page.classList.remove('hidden');
            page.classList.add('active');
            document.body.classList.add('overlay-active');
            if (window.updateResponsiveLayout) window.updateResponsiveLayout();
        }
    }

    function hide() {
        const page = document.getElementById('authorBioPage');
        if (page) {
            page.classList.add('hidden');
            page.classList.remove('active');
            document.body.classList.remove('overlay-active');
        }
    }

    return {
        init,
        show,
        hide
    };
})();

// Initialize when both DOM and POEMS are ready
window.addEventListener('load', () => {
    // Check if POEMS is loaded, it might be loaded after this script
    const checkData = setInterval(() => {
        if (typeof POEMS !== 'undefined') {
            clearInterval(checkData);
            window.AuthorBio.init();
        }
    }, 100);
});
