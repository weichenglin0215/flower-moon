/* author_bio.js */



window.AuthorBio = (function () {

    let allAuthors = []; // { name, dynasty, totalRating, poems: [] }

    let filteredAuthors = [];

    let selectedAuthor = null;

    let currentSort = 'rating'; // 'rating' or 'text'

    let dynasties = [];

    let surnames = [];



    function init() {

        // 確保 author_bio.css 已載入

        if (!document.getElementById('author-bio-css')) {

            const link = document.createElement('link');

            link.id = 'author-bio-css';

            link.rel = 'stylesheet';

            link.href = 'author_bio.css';

            document.head.appendChild(link);

        }



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

        page.className = 'author_bio-overlay hidden'; /* removed aspect-5-8, repositioned by registerOverlayResize */

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

                        <span id="authorCount" style="font-size: 16px; font-weight: normal; opacity: 0.8;"></span>

                    </div>

                    <div class="author-scroll" id="authorList"></div>

                </div>

                <div class="works-list-container">

                    <div class="list-title">作品列表

                        <button class="sort-btn active" data-sort="rating" style="font-size: 16px; font-weight: normal; opacity: 0.8;">評價 ↓</button>

                        <button class="sort-btn" data-sort="text" style="font-size: 16px; font-weight: normal; opacity: 0.8;">名稱 ↓</button>

                    </div>

                    <div class="works-scroll" id="worksList">

                        <div style="padding: 12px; text-align: center; opacity: 0.5;">請選擇一位作者</div>

                    </div>

                </div>

            </div>

        `;

        document.body.appendChild(page);
        
        if (window.registerOverlayResize) {
            window.registerOverlayResize((r) => {
                page.style.left = r.left + 'px';
                page.style.top = r.top + 'px';
                page.style.width = '500px';
                page.style.height = '850px';
                page.style.transform = 'scale(' + r.scale + ')';
                page.style.transformOrigin = 'top left';
            });
        }


        // Events

        page.querySelector('.page-close-btn').addEventListener('click', () => {

            if (window.SoundManager) window.SoundManager.playCloseItem(); //關閉選單，降低音頻。

            hide();

        });



        document.getElementById('dynastyFilter').addEventListener('change', applyFilters);

        document.getElementById('surnameFilter').addEventListener('change', applyFilters);

        document.getElementById('bioSearch').addEventListener('input', applyFilters);

        //排序按鈕

        const sortBtns = page.querySelectorAll('.sort-btn');

        sortBtns.forEach(btn => {

            btn.addEventListener('click', () => {

                if (window.SoundManager) window.SoundManager.playOpenItem(); //重新排序，提高音頻。

                sortBtns.forEach(b => b.classList.remove('active'));

                btn.classList.add('active');

                currentSort = btn.dataset.sort;

                if (selectedAuthor) updateWorksList();

            });

        });



        // Setup momentum scroll for lists

        setupMomentumScroll(document.getElementById('authorList'));

        setupMomentumScroll(document.getElementById('worksList'));

    }

    // 增加捲動功能的通用處理函式 (支持滑鼠及觸控)

    function setupMomentumScroll(scrollContainer) {

        let isDown = false;

        let startY;

        let scrollTop;

        let velocity = 0;

        let lastY = 0;

        let lastTime = 0;

        let momentumID = null;



        const startInertia = () => {

            const friction = 0.97;// 摩擦係數，數值越大滑得越遠

            const step = () => {

                if (Math.abs(velocity) < 0.1) {

                    cancelAnimationFrame(momentumID);

                    return;

                }

                scrollContainer.scrollTop -= velocity;

                velocity *= friction;

                momentumID = requestAnimationFrame(step);

            };

            momentumID = requestAnimationFrame(step);

        };



        scrollContainer.addEventListener('mousedown', (e) => {

            if (e.target.tagName.toLowerCase() === 'button' || e.target.closest('button')) return;

            isDown = true;

            scrollContainer.classList.add('grabbing');

            startY = e.pageY - scrollContainer.offsetTop;

            scrollTop = scrollContainer.scrollTop;

            velocity = 0;

            cancelAnimationFrame(momentumID);

            lastY = e.pageY;

            lastTime = Date.now();

        });



        const endDrag = () => {

            if (!isDown) return;

            isDown = false;

            scrollContainer.classList.remove('grabbing');

            startInertia();

        };



        scrollContainer.addEventListener('mouseleave', endDrag);

        scrollContainer.addEventListener('mouseup', endDrag);



        scrollContainer.addEventListener('mousemove', (e) => {

            if (!isDown) return;

            e.preventDefault();

            const y = e.pageY - scrollContainer.offsetTop;

            const walk = (y - startY) * 1.5;

            scrollContainer.scrollTop = scrollTop - walk;



            const now = Date.now();

            const dt = now - lastTime;

            if (dt > 0) {

                const dy = e.pageY - lastY;

                velocity = dy * 0.8;

                lastTime = now;

                lastY = e.pageY;

            }

        });



        scrollContainer.addEventListener('touchstart', (e) => {

            if (e.target.tagName.toLowerCase() === 'button' || e.target.closest('button')) return;

            isDown = true;

            startY = e.touches[0].pageY - scrollContainer.offsetTop;

            scrollTop = scrollContainer.scrollTop;

            velocity = 0;

            cancelAnimationFrame(momentumID);

            lastY = e.touches[0].pageY;

            lastTime = Date.now();

        }, { passive: true });



        scrollContainer.addEventListener('touchmove', (e) => {

            if (!isDown) return;

            const y = e.touches[0].pageY - scrollContainer.offsetTop;

            const walk = (y - startY) * 1.2;

            scrollContainer.scrollTop = scrollTop - walk;



            const now = Date.now();

            const dt = now - lastTime;

            if (dt > 0) {

                const dy = e.touches[0].pageY - lastY;

                velocity = dy * 0.8;

                lastTime = now;

                lastY = e.touches[0].pageY;

            }

        }, { passive: true });



        scrollContainer.addEventListener('touchend', endDrag);

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

                <div class="author-name">

                    ${author.name} 

                    <span style="font-size: 16px; font-weight: normal; opacity: 0.8;">(${author.dynasty})</span>

                </div>

                <div class="author-stats">

                    <span>總評: ${author.totalRating}</span>

                    <span>作品: ${author.poems.length}</span>

                </div>

            </div>

        `).join('');



        // Re-attach click events

        list.querySelectorAll('.author-item').forEach(item => {

            item.addEventListener('click', () => {

                if (window.SoundManager) window.SoundManager.playConfirmItem(); //選定項目，提高音頻。

                const name = item.dataset.name;

                selectedAuthor = allAuthors.find(a => a.name === name);



                // Update UI state

                list.querySelectorAll('.author-item').forEach(i => i.classList.remove('selected'));

                item.classList.add('selected');



                updateWorksList();

            });

        });

    }

    //更新作品列表

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

                <div class="work-snippet">${poem.content[0]}，${poem.content[1]}，...</div>

            </div>

        `).join('');



        list.querySelectorAll('.work-item').forEach(item => {

            item.addEventListener('click', () => {

                if (window.SoundManager) window.SoundManager.playConfirmItem(); //選定項目，提高音頻。

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

            /* updateResponsiveLayout replaced by registerOverlayResize */

        }

    }



    function hide() {

        const page = document.getElementById('authorBioPage');

        if (page) {

            page.classList.add('hidden');

            page.classList.remove('active');

            document.body.classList.remove('overlay-active');



            // 恢復主頁顯示

            const container = document.getElementById('calendarCardContainer') || document.getElementById('cardContainer');

            if (container) container.style.display = '';

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

