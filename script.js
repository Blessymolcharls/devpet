// script.js - CodeBuddy State & Game Logic (Premium V3)

// --- Audio Synthesis Engine ---
class SynthEngine {
    constructor() { this.ctx = null; this.muted = false; }
    init() { if (!this.ctx) { const AudioContext = window.AudioContext || window.webkitAudioContext; this.ctx = new AudioContext(); } }
    playTone(freq, type, duration, vol=0.1) {
        if (this.muted || !this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.start(); osc.stop(this.ctx.currentTime + duration);
    }
    play(sound) {
        if (this.muted) return;
        this.init();
        if (this.ctx.state === 'suspended') this.ctx.resume();
        switch(sound) {
            case 'click': this.playTone(400, 'square', 0.1, 0.05); break;
            case 'coin': this.playTone(800, 'sine', 0.1, 0.1); setTimeout(() => this.playTone(1200, 'sine', 0.2, 0.1), 100); break;
            case 'level': [400, 500, 600, 800, 1000].forEach((f, i) => setTimeout(() => this.playTone(f, 'square', 0.15, 0.1), i * 150)); break;
            case 'error': this.playTone(200, 'sawtooth', 0.3, 0.1); break;
        }
    }
}
const audio = new SynthEngine();

// --- Main App ---
class CodeBuddy {
    constructor() {
        this.storageKey = 'codebuddy_pet_state';
        this.state = {
            level: 1, currentXp: 0, currentHappiness: 100, coins: 0, streak: 0, longestStreak: 0,
            lastTaskDate: null, totalTasksCompleted: 0, unlockedAchievements: [],
            equippedAccessories: { hat: false, glasses: false, crown: false, bg: null },
            shopUnlocked: ['acc-hat', 'acc-glasses', 'acc-crown'], collectibles: [],
            stats: { playtimeSeconds: 0 }, challenges: [], theme: 'cyberpunk', audioMuted: false,
            lastActiveTime: Date.now()
        };
        this.xpPerLevel = 100; this.happinessDecayRate = 1; this.happinessDecayIntervalMs = 3000; this.sleepTimeoutMs = 60000;
        this.sleepTimer = null; this.decayInterval = null; this.playtimeInterval = null;
        this.dialogueInterval = null; this.eventInterval = null; this.isSleeping = false;
        this.petStateTimeout = null; this.pomoInterval = null;
        this.pomo = { active: false, timeRem: 25 * 60, isWork: true };

        this.init();
    }

    init() {
        this.loadState();
        this.cacheDOM();
        this.applyTheme();
        this.bindEvents();
        this.initRipples();
        this.initAtmosphere();
        
        this.checkDailyStreak();
        this.generateChallenges();
        this.renderShop();
        this.renderCollectibles();
        
        this.updateUI(true); // true = force instant, no animation on load
        this.checkUnlocks();
        this.startLoops();
        this.resetSleepTimer();
        this.setPetMood('idle');
    }

    loadState() {
        const saved = localStorage.getItem(this.storageKey);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                this.state = { ...this.state, ...parsed };
                if(!this.state.shopUnlocked) this.state.shopUnlocked = [];
                if(!this.state.collectibles) this.state.collectibles = [];
                if(!this.state.challenges) this.state.challenges = [];
                audio.muted = this.state.audioMuted;
                const elapsedMs = Date.now() - this.state.lastActiveTime;
                if (elapsedMs > 0) {
                    const decayTicks = Math.floor(elapsedMs / this.happinessDecayIntervalMs);
                    this.state.currentHappiness = Math.max(0, this.state.currentHappiness - (decayTicks * this.happinessDecayRate));
                }
            } catch (e) { console.error("Load failed", e); }
        }
        this.state.lastActiveTime = Date.now();
        this.saveState();
    }

    saveState() {
        this.state.lastActiveTime = Date.now();
        localStorage.setItem(this.storageKey, JSON.stringify(this.state));
    }

    cacheDOM() {
        this.dom = {
            themeSwitcher: document.getElementById('theme-switcher'), btnMute: document.getElementById('btn-mute'),
            btnFloating: document.getElementById('btn-floating'), btnUnfloat: document.getElementById('btn-unfloat'),
            fwXp: document.getElementById('fw-xp'), btnExport: document.getElementById('btn-export'),
            btnImport: document.getElementById('btn-import'), btnReset: document.getElementById('btn-reset'),
            levelDisplay: document.getElementById('level-display'), xpText: document.getElementById('xp-text'), xpBar: document.getElementById('xp-bar'),
            happinessText: document.getElementById('happiness-text'), happinessBar: document.getElementById('happiness-bar'),
            coinsDisplay: document.getElementById('coins-display'), streakDisplay: document.getElementById('streak-display'),
            longestStreakDisplay: document.getElementById('longest-streak-display'), totalTasksDisplay: document.getElementById('total-tasks-display'),
            pomoTime: document.getElementById('pomodoro-time'), pomo25: document.getElementById('btn-pomo-25'),
            pomo50: document.getElementById('btn-pomo-50'), pomoStart: document.getElementById('btn-pomo-start'), pomoStop: document.getElementById('btn-pomo-stop'),
            btnTask: document.getElementById('btn-task'), petContainer: document.getElementById('pet-container'), mouth: document.getElementById('mouth'),
            particleContainer: document.getElementById('particle-container'), sleepParticles: document.getElementById('sleep-particles'),
            dialogueBubble: document.getElementById('dialogue-bubble'), eventContainer: document.getElementById('event-container'),
            acc: { hat: document.getElementById('acc-hat'), glasses: document.getElementById('acc-glasses'), crown: document.getElementById('acc-crown') },
            tabBtns: document.querySelectorAll('.tab-btn'), tabContents: document.querySelectorAll('.tab-content'),
            shopGrid: document.getElementById('shop-grid'), invGrid: document.getElementById('inventory-grid'),
            colGrid: document.getElementById('collectibles-grid'), chalList: document.getElementById('challenges-list'),
            dash: { tasks: document.getElementById('dash-tasks'), xp: document.getElementById('dash-xp'), level: document.getElementById('dash-level'),
                happiness: document.getElementById('dash-happiness'), coins: document.getElementById('dash-coins'),
                streak: document.getElementById('dash-streak'), achievements: document.getElementById('dash-achievements')
            },
            modalOverlay: document.getElementById('modal-overlay'), modalLevel: document.getElementById('modal-level'),
            btnCloseModal: document.getElementById('btn-close-modal'), toastContainer: document.getElementById('toast-container'),
            canvas: document.getElementById('pet-atmosphere')
        };
    }

    bindEvents() {
        this.dom.btnTask.addEventListener('click', (e) => { audio.play('click'); this.completeTask(e); });
        document.addEventListener('click', () => { this.resetSleepTimer(); if (this.isSleeping) this.wakeUp(); });
        this.dom.tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                audio.play('click');
                this.dom.tabBtns.forEach(b => b.classList.remove('active'));
                this.dom.tabContents.forEach(c => c.classList.remove('active'));
                e.target.classList.add('active');
                document.getElementById(`tab-${e.target.getAttribute('data-tab')}`).classList.add('active');
            });
        });
        this.dom.pomo25.addEventListener('click', () => this.setPomo(25));
        this.dom.pomo50.addEventListener('click', () => this.setPomo(50));
        this.dom.pomoStart.addEventListener('click', () => this.startPomo());
        this.dom.pomoStop.addEventListener('click', () => this.stopPomo());
        this.dom.themeSwitcher.addEventListener('change', (e) => { this.state.theme = e.target.value; this.applyTheme(); this.saveState(); });
        this.dom.btnMute.addEventListener('click', () => { this.state.audioMuted = !this.state.audioMuted; audio.muted = this.state.audioMuted; this.dom.btnMute.textContent = this.state.audioMuted ? '🔇' : '🔊'; this.saveState(); });
        this.dom.btnExport.addEventListener('click', () => this.exportSave());
        this.dom.btnImport.addEventListener('change', (e) => this.importSave(e));
        this.dom.btnReset.addEventListener('click', () => { if(confirm("Are you sure? This deletes ALL progress!")) { localStorage.removeItem(this.storageKey); location.reload(); } });
        this.dom.btnFloating.addEventListener('click', () => { document.body.classList.add('floating-active'); audio.play('click'); });
        this.dom.btnUnfloat.addEventListener('click', () => { document.body.classList.remove('floating-active'); audio.play('click'); });
        this.dom.btnCloseModal.addEventListener('click', () => { this.dom.modalOverlay.classList.add('hidden'); audio.play('click'); });
    }

    // --- Premium Micro-Interactions ---
    initRipples() {
        document.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
                const btn = e.target.tagName === 'BUTTON' ? e.target : e.target.closest('button');
                const rect = btn.getBoundingClientRect();
                const ripple = document.createElement('span');
                ripple.className = 'ripple';
                const size = Math.max(rect.width, rect.height);
                ripple.style.width = ripple.style.height = `${size}px`;
                ripple.style.left = `${e.clientX - rect.left - size/2}px`;
                ripple.style.top = `${e.clientY - rect.top - size/2}px`;
                btn.appendChild(ripple);
                setTimeout(() => ripple.remove(), 600);
            }
        });
    }

    animateValue(el, start, end, duration) {
        if (start === end) return;
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            el.textContent = Math.floor(progress * (end - start) + start);
            if (progress < 1) {
                window.requestAnimationFrame(step);
            } else {
                el.textContent = end;
                el.style.transform = 'scale(1)'; // Reset scale
            }
        };
        el.style.transform = 'scale(1.2)';
        window.requestAnimationFrame(step);
    }

    initAtmosphere() {
        const ctx = this.dom.canvas.getContext('2d');
        let width = this.dom.canvas.parentElement.clientWidth;
        let height = this.dom.canvas.parentElement.clientHeight;
        this.dom.canvas.width = width; this.dom.canvas.height = height;
        const particles = [];
        for(let i=0; i<30; i++) {
            particles.push({
                x: Math.random() * width, y: Math.random() * height,
                s: Math.random() * 2 + 1, dy: Math.random() * -0.5 - 0.1,
                alpha: Math.random() * 0.5
            });
        }
        const draw = () => {
            ctx.clearRect(0,0,width,height);
            ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--color-accent');
            particles.forEach(p => {
                ctx.globalAlpha = p.alpha;
                ctx.fillRect(p.x, p.y, p.s, p.s);
                p.y += p.dy;
                if(p.y < 0) { p.y = height; p.x = Math.random() * width; }
            });
            requestAnimationFrame(draw);
        };
        draw();
    }

    spawnConfetti() {
        for(let i=0; i<40; i++) {
            const c = document.createElement('div');
            c.className = 'confetti';
            c.style.backgroundColor = ['#FF0055', '#00F0FF', '#39FF14', '#FFB800'][Math.floor(Math.random()*4)];
            c.style.left = `${Math.random() * 100}vw`;
            c.style.top = `-10px`;
            c.style.animationDuration = `${Math.random() * 2 + 1}s`;
            c.style.animationDelay = `${Math.random() * 0.5}s`;
            document.body.appendChild(c);
            setTimeout(() => c.remove(), 3000);
        }
    }

    showToast(type, message) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        const icons = { success: '✓', warning: '⚠️', achievement: '🏆' };
        toast.innerHTML = `<span class="toast-icon">${icons[type]}</span> <div>${message}</div>`;
        this.dom.toastContainer.appendChild(toast);
        if (type === 'achievement') this.spawnConfetti();
        setTimeout(() => { if (toast.parentNode) toast.remove(); }, 4000);
    }

    // --- Core Systems ---
    startLoops() {
        this.decayInterval = setInterval(() => {
            if (this.state.currentHappiness > 0) {
                const old = this.state.currentHappiness;
                this.state.currentHappiness = Math.max(0, this.state.currentHappiness - this.happinessDecayRate);
                this.updateHappinessUI();
                this.updateExpression();
                this.saveState();
            }
        }, this.happinessDecayIntervalMs);
        this.playtimeInterval = setInterval(() => this.state.stats.playtimeSeconds++, 1000);
        this.dialogueInterval = setInterval(() => this.showDialogue(), 20000);
        this.eventInterval = setInterval(() => this.triggerRandomEvent(), 45000);
    }

    checkDailyStreak() {
        const todayStr = new Date().toISOString().split('T')[0];
        if (this.state.lastTaskDate && this.state.lastTaskDate !== todayStr) {
            const diffDays = Math.floor((new Date() - new Date(this.state.lastTaskDate)) / 86400000);
            if (diffDays === 1) {
                this.state.streak++;
                this.state.longestStreak = Math.max(this.state.longestStreak, this.state.streak);
                this.showToast('success', `🔥 Streak kept! Day ${this.state.streak}`);
            } else if (diffDays > 1) {
                this.state.streak = 0;
                this.showToast('warning', `🧊 Streak lost.`);
            }
        }
    }

    completeTask(e) {
        const todayStr = new Date().toISOString().split('T')[0];
        if (this.state.lastTaskDate !== todayStr) { this.checkDailyStreak(); if (this.state.streak === 0) this.state.streak = 1; this.state.lastTaskDate = todayStr; }

        const oldXp = this.state.currentXp;
        const oldCoins = this.state.coins;
        const oldTasks = this.state.totalTasksCompleted;

        this.state.totalTasksCompleted += 1;
        this.state.currentHappiness = Math.min(100, this.state.currentHappiness + 10);
        let xpGained = 20, coinsGained = 5 + Math.floor(this.state.streak / 2);
        this.state.currentXp += xpGained; this.state.coins += coinsGained;

        this.spawnFloatingText(`+${xpGained}XP / +${coinsGained}🪙`, e.clientX, e.clientY);
        this.tempPetMood('happy', 2000);
        audio.play('coin');

        if (Math.random() < 0.1) this.grantCollectible();
        if (this.state.currentXp >= this.xpPerLevel) this.levelUp();

        this.checkAchievements();
        this.updateChallengeProgress('tasks', 1);
        this.updateUI(false, { oldXp, oldCoins, oldTasks });
        this.saveState();
    }

    levelUp() {
        this.state.level += 1;
        this.state.currentXp -= this.xpPerLevel;
        this.tempPetMood('excited', 3000);
        this.dom.modalLevel.textContent = this.state.level;
        this.dom.modalOverlay.classList.remove('hidden');
        this.spawnSparkles();
        this.checkUnlocks();
        this.updateEvolution();
        audio.play('level');
        this.updateChallengeProgress('levels', 1);
    }
    
    updateEvolution() {
        this.dom.petContainer.className = 'pet-container'; // reset
        if (this.state.level >= 50) this.dom.petContainer.classList.add('evo-legendary');
        else if (this.state.level >= 30) this.dom.petContainer.classList.add('evo-advanced');
        else if (this.state.level >= 10) this.dom.petContainer.classList.add('evo-junior');
    }

    // --- Moods & Sleep ---
    resetSleepTimer() { clearTimeout(this.sleepTimer); this.sleepTimer = setTimeout(() => this.goSleep(), this.sleepTimeoutMs); }
    goSleep() {
        this.isSleeping = true; this.setPetMood('sleeping');
        this.dom.sleepParticles.innerHTML = ''; this.dom.sleepParticles.classList.remove('hidden');
        for(let i=0; i<3; i++) {
            setTimeout(() => {
                if(!this.isSleeping) return;
                const zzz = document.createElement('div'); zzz.className = 'zzz-particle'; zzz.textContent = 'Zzz';
                zzz.style.left = `${60 + Math.random() * 20}%`; zzz.style.top = `${20 + Math.random() * 20}%`;
                this.dom.sleepParticles.appendChild(zzz);
                setTimeout(() => { if(zzz.parentNode) zzz.remove(); }, 3000);
            }, i * 1000);
        }
    }
    wakeUp() { this.isSleeping = false; this.dom.sleepParticles.classList.add('hidden'); this.dom.sleepParticles.innerHTML = ''; this.setPetMood('idle'); }
    
    setPetMood(mood) {
        this.dom.petContainer.classList.remove('state-idle', 'state-happy', 'state-excited', 'state-curious', 'state-focused', 'state-tired', 'state-bored', 'state-sleeping');
        this.dom.petContainer.classList.add(`state-${mood}`);
    }
    tempPetMood(mood, durationMs) { clearTimeout(this.petStateTimeout); this.setPetMood(mood); this.petStateTimeout = setTimeout(() => { if (!this.isSleeping) this.setPetMood('idle'); }, durationMs); }
    
    updateExpression() {
        const h = this.state.currentHappiness;
        if (h >= 75) { this.dom.mouth.setAttribute('width', '4'); this.dom.mouth.setAttribute('height', '2'); this.dom.mouth.setAttribute('y', '14'); }
        else if (h >= 35) { this.dom.mouth.setAttribute('width', '4'); this.dom.mouth.setAttribute('height', '1'); this.dom.mouth.setAttribute('y', '14'); }
        else { this.dom.mouth.setAttribute('width', '2'); this.dom.mouth.setAttribute('height', '1'); this.dom.mouth.setAttribute('y', '15'); this.tempPetMood('tired', 2000); }
    }

    // --- Pomodoro ---
    setPomo(min) { if(!this.pomo.active) { this.pomo.timeRem = min * 60; this.updatePomoUI(); audio.play('click'); } }
    startPomo() {
        if(this.pomo.active) return;
        this.pomo.active = true; this.setPetMood('focused'); audio.play('click');
        this.pomoInterval = setInterval(() => {
            this.pomo.timeRem--; this.updatePomoUI();
            if(this.pomo.timeRem <= 0) this.completePomo();
        }, 1000);
    }
    stopPomo() { this.pomo.active = false; clearInterval(this.pomoInterval); this.setPetMood('idle'); audio.play('click'); }
    updatePomoUI() {
        const m = Math.floor(this.pomo.timeRem / 60).toString().padStart(2, '0');
        const s = (this.pomo.timeRem % 60).toString().padStart(2, '0');
        this.dom.pomoTime.textContent = `${m}:${s}`;
    }
    completePomo() {
        this.stopPomo(); audio.play('level');
        this.showToast("success", "🍅 Focus Session Complete! +50XP +25🪙");
        this.state.currentXp += 50; this.state.coins += 25;
        this.tempPetMood('happy', 4000);
        if (this.state.currentXp >= this.xpPerLevel) this.levelUp();
        this.updateUI(); this.saveState();
    }

    // --- Shop & Inventory ---
    getShopItems() {
        return [
            { id: 'bg-space', name: 'Space BG', cost: 100, type: 'bg', color: '#050511' },
            { id: 'bg-forest', name: 'Forest BG', cost: 100, type: 'bg', color: '#040a04' },
            { id: 'acc-hat2', name: 'Top Hat', cost: 150, type: 'hat' },
            { id: 'acc-shades2', name: 'Neon Shades', cost: 150, type: 'glasses' }
        ];
    }
    renderShop() {
        this.dom.shopGrid.innerHTML = '';
        this.getShopItems().forEach(item => {
            const isOwned = this.state.shopUnlocked.includes(item.id);
            const el = document.createElement('div'); el.className = `shop-item rarity-epic`;
            el.innerHTML = `<div class="inv-icon">🛒</div><div class="inv-details"><span class="inv-name">${item.name}</span><span class="shop-cost">${isOwned ? 'OWNED' : item.cost + ' 🪙'}</span></div><button class="toggle-btn text-warning" ${isOwned ? 'disabled' : ''}>${isOwned ? 'BOUGHT' : 'BUY'}</button>`;
            if(!isOwned) el.querySelector('button').addEventListener('click', () => this.buyItem(item));
            this.dom.shopGrid.appendChild(el);
        });
        this.renderInventory();
    }
    buyItem(item) {
        if(this.state.coins >= item.cost) {
            this.state.coins -= item.cost; this.state.shopUnlocked.push(item.id);
            audio.play('coin'); this.showToast('success', `Bought ${item.name}!`);
            this.saveState(); this.renderShop(); this.updateUI();
        } else { audio.play('error'); this.showToast("warning", "Not enough coins!"); }
    }
    
    renderInventory() {
        this.dom.invGrid.innerHTML = '';
        const items = [
            { id: 'acc-hat', name: 'Retro Cap', req: 2, icon: '🧢', type: 'hat' },
            { id: 'acc-glasses', name: 'Cyber Shades', req: 3, icon: '🕶️', type: 'glasses' },
            { id: 'acc-crown', name: '8-bit Crown', req: 5, icon: '👑', type: 'crown' }
        ];
        this.getShopItems().forEach(si => { if(this.state.shopUnlocked.includes(si.id)) items.push({ id: si.id, name: si.name, req: 1, icon: '✨', type: si.type, color: si.color }); });

        items.forEach(item => {
            const isUnlocked = this.state.level >= item.req || this.state.shopUnlocked.includes(item.id);
            const isEquipped = this.state.equippedAccessories[item.type] === item.id || (this.state.equippedAccessories[item.type] === true && item.id.includes(item.type));
            const el = document.createElement('div'); el.className = `inv-slot rarity-common ${isUnlocked ? '' : 'locked'}`;
            el.innerHTML = `<div class="inv-icon">${item.icon}</div><div class="inv-details"><span class="inv-name">${item.name}</span><span class="inv-status">${isUnlocked ? 'Unlocked' : 'Lvl ' + item.req}</span></div><button class="toggle-btn ${isEquipped ? 'equipped' : ''}" ${isUnlocked ? '' : 'disabled'}>${isEquipped ? 'UNEQUIP' : 'EQUIP'}</button>`;
            if (isUnlocked) {
                el.querySelector('button').addEventListener('click', () => {
                    audio.play('click');
                    if (isEquipped) this.state.equippedAccessories[item.type] = false;
                    else { this.state.equippedAccessories[item.type] = item.id; if(item.type === 'bg') document.body.style.backgroundColor = item.color; }
                    this.saveState(); this.renderInventory(); this.updateAccessoriesUI();
                });
            }
            this.dom.invGrid.appendChild(el);
        });
    }

    checkUnlocks() { this.renderInventory(); this.updateAccessoriesUI(); }
    updateAccessoriesUI() { ['hat', 'glasses', 'crown'].forEach(type => { if(this.dom.acc[type]) { if(this.state.equippedAccessories[type]) this.dom.acc[type].classList.remove('hidden'); else this.dom.acc[type].classList.add('hidden'); } }); }

    // --- Collectibles ---
    grantCollectible() {
        const names = ["Golden Floppy", "Debug Duck", "Syntax Potion", "RAM Stick", "Glitch Shard"];
        const rarities = ["common", "common", "rare", "epic", "legendary"];
        const rand = Math.floor(Math.random() * names.length);
        const col = { name: names[rand], rarity: rarities[rand], date: new Date().toLocaleDateString() };
        this.state.collectibles.push(col);
        this.showToast('success', `Loot Found! ${col.name} (${col.rarity}) 🎁`);
        this.renderCollectibles(); audio.play('level'); this.saveState();
    }
    renderCollectibles() {
        this.dom.colGrid.innerHTML = '';
        if(this.state.collectibles.length === 0) { this.dom.colGrid.innerHTML = '<span class="stat-subtext">No collectibles yet... Keep working!</span>'; return; }
        this.state.collectibles.forEach(c => {
            const el = document.createElement('div'); el.className = `col-item rarity-${c.rarity}`;
            el.innerHTML = `<div class="inv-icon">🎁</div><div class="inv-details"><span class="inv-name">${c.name}</span><span class="inv-status">${c.rarity.toUpperCase()}</span></div>`;
            this.dom.colGrid.appendChild(el);
        });
    }

    // --- Random Events & Dialogues ---
    showDialogue() {
        if(this.isSleeping) return;
        const lines = ["Let's build something awesome!", "One more task!", "You're doing great!", "Every line makes me stronger!", "Time for a coffee break?"];
        this.dom.dialogueBubble.textContent = lines[Math.floor(Math.random() * lines.length)];
        this.dom.dialogueBubble.classList.remove('hidden');
        setTimeout(() => this.dom.dialogueBubble.classList.add('hidden'), 4000);
    }
    triggerRandomEvent() {
        if(this.isSleeping || Math.random() > 0.5) return;
        this.tempPetMood('curious', 3000);
        const events = [{ icon: '🐛', name: 'Bug Attack!', reward: 15 }, { icon: '☕', name: 'Coffee Break', reward: 10 }, { icon: '💎', name: 'Lucky Gem', reward: 50 }];
        const ev = events[Math.floor(Math.random() * events.length)];
        this.dom.eventContainer.textContent = ev.icon; this.dom.eventContainer.classList.remove('hidden');
        const clickHandler = () => {
            this.dom.eventContainer.classList.add('hidden'); this.dom.eventContainer.removeEventListener('click', clickHandler);
            this.state.coins += ev.reward; this.showToast('success', `${ev.name} +${ev.reward}🪙`); audio.play('coin');
            this.tempPetMood('happy', 2000); this.saveState(); this.updateUI();
        };
        this.dom.eventContainer.addEventListener('click', clickHandler);
        setTimeout(() => { this.dom.eventContainer.classList.add('hidden'); this.dom.eventContainer.removeEventListener('click', clickHandler); }, 10000);
    }

    // --- Challenges ---
    generateChallenges() {
        if(this.state.challenges.length === 0) {
            this.state.challenges = [
                { id: 'c1', desc: 'Complete 10 tasks', type: 'tasks', target: 10, progress: 0, reward: 50, done: false },
                { id: 'c2', desc: 'Reach Level 5', type: 'levels', target: 5, progress: this.state.level, reward: 100, done: false }
            ];
            this.saveState();
        }
        this.renderChallenges();
    }
    updateChallengeProgress(type, amt) {
        let changed = false;
        this.state.challenges.forEach(c => {
            if(!c.done && c.type === type) {
                if(type === 'levels') c.progress = this.state.level; else c.progress += amt;
                if(c.progress >= c.target) { c.done = true; this.state.coins += c.reward; this.showToast('achievement', `Challenge Complete! +${c.reward}🪙`); audio.play('level'); }
                changed = true;
            }
        });
        if(changed) { this.saveState(); this.renderChallenges(); }
    }
    renderChallenges() {
        this.dom.chalList.innerHTML = '';
        this.state.challenges.forEach(c => {
            const pct = Math.min(100, (c.progress / c.target) * 100);
            const el = document.createElement('div'); el.className = `challenge-item ${c.done ? 'completed' : ''}`;
            el.innerHTML = `<span class="chal-title">${c.desc} <span>${c.progress}/${c.target}</span></span><span class="stat-subtext">Reward: ${c.reward}🪙</span><div class="chal-prog"><div class="chal-prog-fill" style="width: ${pct}%"></div></div>`;
            this.dom.chalList.appendChild(el);
        });
    }

    // --- Core Data & UI ---
    applyTheme() { document.body.setAttribute('data-theme', this.state.theme); this.dom.themeSwitcher.value = this.state.theme; this.dom.btnMute.textContent = this.state.audioMuted ? '🔇' : '🔊'; }
    exportSave() { const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.state)); const anchor = document.createElement('a'); anchor.setAttribute("href", dataStr); anchor.setAttribute("download", "codebuddy_save.json"); document.body.appendChild(anchor); anchor.click(); anchor.remove(); }
    importSave(e) { const file = e.target.files[0]; if(!file) return; const reader = new FileReader(); reader.onload = (event) => { try { const parsed = JSON.parse(event.target.result); localStorage.setItem(this.storageKey, JSON.stringify(parsed)); location.reload(); } catch(err) { alert("Invalid save file"); } }; reader.readAsText(file); }

    checkAchievements() {
        const tasks = this.state.totalTasksCompleted;
        const thresholds = { 1: "First Code", 5: "Code Monkey", 10: "Script Kiddie", 25: "Stack Overflow Sr.", 50: "Linus Mode" };
        for (const [target, name] of Object.entries(thresholds)) {
            const num = parseInt(target); const achId = `ach-${num}`;
            if (tasks >= num && !this.state.unlockedAchievements.includes(achId)) {
                this.state.unlockedAchievements.push(achId);
                const achEl = document.getElementById(achId); if (achEl) achEl.classList.remove('locked');
                this.showToast('achievement', `Achievement Unlocked: ${name} 🏆`); audio.play('level');
            }
        }
    }

    spawnFloatingText(text, x, y) {
        const el = document.createElement('div'); el.className = 'floating-text'; el.textContent = text;
        el.style.left = `${x}px`; el.style.top = `${y}px`; document.body.appendChild(el); setTimeout(() => el.remove(), 1500);
    }
    spawnSparkles() {
        const rect = this.dom.petContainer.getBoundingClientRect(); const cx = rect.left + rect.width / 2; const cy = rect.top + rect.height / 2;
        // Sparkle burst
        const burst = document.createElement('div'); burst.className = 'sparkle-burst'; burst.style.left = `${cx}px`; burst.style.top = `${cy}px`; document.body.appendChild(burst); setTimeout(() => burst.remove(), 600);
        for (let i = 0; i < 20; i++) {
            const sparkle = document.createElement('div'); sparkle.className = 'sparkle'; sparkle.style.left = `${cx}px`; sparkle.style.top = `${cy}px`;
            const angle = Math.random() * Math.PI * 2; const dist = 50 + Math.random() * 50; sparkle.style.setProperty('--tx', `${Math.cos(angle) * dist}px`); sparkle.style.setProperty('--ty', `${Math.sin(angle) * dist}px`);
            document.body.appendChild(sparkle); setTimeout(() => sparkle.remove(), 600);
        }
    }

    updateHappinessUI() {
        this.dom.happinessText.textContent = Math.floor(this.state.currentHappiness);
        this.dom.happinessBar.style.width = `${this.state.currentHappiness}%`;
    }

    updateUI(instant = false, prevObj = {}) {
        this.dom.levelDisplay.textContent = this.state.level;
        this.dom.xpBar.style.width = `${(this.state.currentXp / this.xpPerLevel) * 100}%`;
        this.dom.streakDisplay.textContent = this.state.streak;
        this.dom.longestStreakDisplay.textContent = this.state.longestStreak;
        if (this.dom.fwXp) this.dom.fwXp.textContent = this.state.currentXp;

        if (instant) {
            this.dom.xpText.textContent = this.state.currentXp;
            this.dom.totalTasksDisplay.textContent = this.state.totalTasksCompleted;
            this.dom.coinsDisplay.textContent = this.state.coins;
        } else {
            this.animateValue(this.dom.xpText, prevObj.oldXp || 0, this.state.currentXp, 500);
            this.animateValue(this.dom.totalTasksDisplay, prevObj.oldTasks || 0, this.state.totalTasksCompleted, 300);
            this.animateValue(this.dom.coinsDisplay, prevObj.oldCoins || 0, this.state.coins, 600);
        }

        this.updateHappinessUI();
        this.updateExpression();
        this.updateEvolution();
        
        // Dashboard
        this.dom.dash.tasks.textContent = this.state.totalTasksCompleted;
        this.dom.dash.xp.textContent = (this.state.level - 1) * this.xpPerLevel + this.state.currentXp;
        this.dom.dash.level.textContent = this.state.level;
        this.dom.dash.happiness.textContent = Math.floor(this.state.currentHappiness);
        this.dom.dash.coins.textContent = this.state.coins;
        this.dom.dash.streak.textContent = this.state.longestStreak;
        this.dom.dash.achievements.textContent = this.state.unlockedAchievements.length;

        this.state.unlockedAchievements.forEach(achId => { const achEl = document.getElementById(achId); if (achEl) achEl.classList.remove('locked'); });
    }
}

// Boot up
document.addEventListener('DOMContentLoaded', () => { window.codeBuddyApp = new CodeBuddy(); });
