import os

def insert_auto_play(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 1. Add isAutoPlaying flag
    content = content.replace('lastTime: 0,', 'lastTime: 0,\n\n        // AutoPlay\n        isAutoPlaying: false,')
    
    # 2. Add methods
    methods = """
        toggleAutoPlay: function () {
            if (!this.isActive) return;
            this.isAutoPlaying = !this.isAutoPlaying;
            this.showAutoPlayStatus(this.isAutoPlaying ? "自動遊玩：開啟" : "自動遊玩：關閉");
        },

        showAutoPlayStatus: function (text) {
            let statusEl = document.getElementById('game5-autoplay-status');
            if (!statusEl) {
                statusEl = document.createElement('div');
                statusEl.id = 'game5-autoplay-status';
                statusEl.style.cssText = `
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: rgba(0,0,0,0.7);
                    color: gold;
                    padding: 10px 20px;
                    border-radius: 20px;
                    font-weight: bold;
                    pointer-events: none;
                    z-index: 1000;
                    opacity: 0;
                    transition: opacity 0.3s;
                `;
                document.getElementById('game5-container').appendChild(statusEl);
            }
            statusEl.textContent = text;
            statusEl.style.opacity = '1';
            setTimeout(() => { statusEl.style.opacity = '0'; }, 1000);
        },

        autoPlayMove: function () {
            if (!this.player || !this.isActive || this.isDying) return;

            const target = this.foods.find(f => f.index === this.collectedCount);
            if (!target) return;

            const pg = this.getGridPos(this.player.x, this.player.y);
            const targetPos = { r: target.row, c: target.col };

            // Find shortest path to target while avoiding ghosts
            const nextDir = this.findBestDirection(pg, targetPos);
            if (nextDir) {
                this.player.nextDir = nextDir;
            }
        },

        findBestDirection: function (start, target) {
            const dirs = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
            
            let bestDir = null;
            let minWeight = Infinity;

            for (let dir of dirs) {
                if (!this.canMoveFromCell(start.r, start.c, dir, true)) continue;

                let nr = start.r, nc = start.c;
                if (dir === 'UP') nr--; else if (dir === 'DOWN') nr++; else if (dir === 'LEFT') nc--; else if (dir === 'RIGHT') nc++;

                // Calculate weight for this move
                const dist = this.getMazeDistance({r: nr, c: nc}, target);
                
                let penalty = 0;
                for (let g of this.monsters) {
                    const ggp = this.getGridPos(g.x, g.y);
                    // Manhattan distance to ghost
                    const d = Math.abs(nr - ggp.r) + Math.abs(nc - ggp.c);
                    
                    if (d <= 3) {
                        penalty += (4 - d) * 50;
                    }
                    
                    // Special handling for Red (Chase) and Green (Ambush)
                    if (g.ai === 'chase' && d <= 5) penalty += 100;
                    if (g.ai === 'ambush') {
                        // Predict ambush target
                        const offsets = { 'UP': [-5, 0], 'DOWN': [5, 0], 'LEFT': [0, -5], 'RIGHT': [0, 5] };
                        const off = offsets[this.player.dir] || [0, 0];
                        const tr = Math.max(0, Math.min(this.rows - 1, start.r + off[0]));
                        const tc = Math.max(0, Math.min(this.cols - 1, start.c + off[1]));
                        const dAmbush = Math.abs(nr - tr) + Math.abs(nc - tc);
                        if (dAmbush <= 2) penalty += 150;
                    }
                }

                // Avoid Cyan trail if possible (though less critical)
                if (this.playerPath.some(p => p.r === nr && p.c === nc)) {
                    penalty += 10;
                }

                const weight = dist + penalty;
                if (weight < minWeight) {
                    minWeight = weight;
                    bestDir = dir;
                }
            }
            return bestDir;
        },

        getMazeDistance: function (start, target) {
            if (start.r === target.r && start.c === target.c) return 0;
            const queue = [{ r: start.r, c: start.c, d: 0 }];
            const visited = new Set();
            visited.add(`${start.r},${start.c}`);

            while (queue.length > 0) {
                const curr = queue.shift();
                if (curr.r === target.r && curr.c === target.c) return curr.d;

                for (let dir of ['UP', 'DOWN', 'LEFT', 'RIGHT']) {
                    let nr = curr.r, nc = curr.c;
                    if (dir === 'UP') nr--; else if (dir === 'DOWN') nr++; else if (dir === 'LEFT') nc--; else if (dir === 'RIGHT') nc++;

                    if (this.canMoveFromCell(curr.r, curr.c, dir, true)) {
                        const key = `${nr},${nc}`;
                        if (!visited.has(key)) {
                            visited.add(key);
                            queue.push({ r: nr, c: nc, d: curr.d + 1 });
                        }
                    }
                }
                if (queue.length > 400) break; // Safety break
            }
            return 1000;
        },
"""
    content = content.replace('        setupMaze: function () {', methods + '\n        setupMaze: function () {')
    
    # 3. Add hotkey
    keydown_logic = """                    case 'ArrowRight': this.handleInput('RIGHT'); break;
                }

                // Alt + A to toggle Auto-Play
                if (e.altKey && (e.key === 'a' || e.key === 'A')) {
                    e.preventDefault();
                    this.toggleAutoPlay();
                }"""
    content = content.replace("                    case 'ArrowRight': this.handleInput('RIGHT'); break;", keydown_logic)
    
    # 4. Add call in update loop
    update_logic = """        update: function (dt) {
            if (!this.isDying) {
                if (this.isAutoPlaying) this.autoPlayMove();
                this.moveEntity(this.player, true);"""
    content = content.replace("        update: function (dt) {\n            if (!this.isDying) {\n                this.moveEntity(this.player, true);", update_logic)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

if __name__ == "__main__":
    insert_auto_play(r'..\game5.js')
