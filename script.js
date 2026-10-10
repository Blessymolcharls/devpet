// script.js - CodeBuddy State & Game Logic (Refactored & Verified)

// --- Audio Synthesis Engine ---
class SynthEngine {
    constructor() {
        this.ctx = null;
        this.muted = false;
    }

    init() {
        if (!this.ctx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) {
                this.ctx = new AudioContextClass();
            }
        }
    }

    playTone(freq, type, duration, vol = 0.1) {
        if (this.muted || !this.ctx) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            gain.gain.setValueAtTime(vol, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + duration);
        } catch (e) {
            // Audio context may not be allowed yet; fail silently
        }
    }

    play(sound) {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;
        if (this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => {});
        }
        switch (sound) {
            case 'click':
                this.playTone(400, 'square', 0.08, 0.04);
                break;
            case 'coin':
                this.playTone(800, 'sine', 0.1, 0.08);
                setTimeout(() => this.playTone(1200, 'sine', 0.15, 0.08), 80);
                break;
            case 'level':
                [400, 500, 600, 800, 1000].forEach((f, i) => {
                    setTimeout(() => this.playTone(f, 'square', 0.12, 0.08), i * 120);
                });
                break;
            case 'error':
                this.playTone(200, 'sawtooth', 0.25, 0.08);
                break;
        }
    }
}
const audio = new SynthEngine();

// --- Main Companion App ---
class CodeBuddy {
    constructor() {
        this.storageKey = 'codebuddy_pet_state';
        this.state = {
            level: 1,
            currentXp: 0,
            currentHappiness: 100,
            coins: 0,
            streak: 0,
            longestStreak: 0,
            lastTaskDate: null,
            totalTasksCompleted: 0,
            unlockedAchievements: [],
            equippedAccessories: { hat: false, glasses: false, crown: false, bg: null },
            shopUnlocked: ['acc-hat', 'acc-glasses', 'acc-crown'],
            collectibles: [],
            stats: { playtimeSeconds: 0 },
            challenges: [],
            theme: 'cyberpunk',
            audioMuted: false,
            lastActiveTime: Date.now()
        };

        this.xpPerLevel = 100;
        this.happinessDecayRate = 1;
        this.happinessDecayIntervalMs = 15000; // 15 seconds per 1% decay (25 min from 100 to 0)
        this.sleepTimeoutMs = 60000;

        this.sleepTimer = null;
        this.decayInterval = null;
        this.playtimeInterval = null;
        this.dialogueInterval = null;
        this.eventInterval = null;
        this.dialogueTimeout = null;
        this.eventTimeout = null;

        this.isSleeping = false;
        this.petStateTimeout = null;
        this.pomoInterval = null;
        this.pomo = { active: false, timeRem: 25 * 60, selectedMin: 25 };
        this.canvasAccentColor = '#00F0FF';

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
        this.renderAchievements();
        this.renderShop();
        this.renderCollectibles();

        this.updateUI(true);
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
                if (parsed && typeof parsed === 'object') {
                    this.state = {
                        ...this.state,
                        ...parsed,
                        equippedAccessories: {
                            ...this.state.equippedAccessories,
                            ...(parsed.equippedAccessories || {})
                        },
                        stats: {
                            ...this.state.stats,
                            ...(parsed.stats || {})
                        }
                    };
                }
            } catch (e) {
                console.error("Save load failed, using defaults", e);
            }
        }

        // Validate and sanitize state bounds
        this.state.level = Math.max(1, parseInt(this.state.level, 10) || 1);
        this.state.currentXp = Math.max(0, parseInt(this.state.currentXp, 10) || 0);
        this.state.currentHappiness = Math.min(100, Math.max(0, parseFloat(this.state.currentHappiness) || 100));
        this.state.coins = Math.max(0, parseInt(this.state.coins, 10) || 0);
        this.state.streak = Math.max(0, parseInt(this.state.streak, 10) || 0);
        this.state.longestStreak = Math.max(this.state.streak, parseInt(this.state.longestStreak, 10) || 0);
        this.state.totalTasksCompleted = Math.max(0, parseInt(this.state.totalTasksCompleted, 10) || 0);

        if (!Array.isArray(this.state.shopUnlocked)) {
            this.state.shopUnlocked = ['acc-hat', 'acc-glasses', 'acc-crown'];
        }
        if (!Array.isArray(this.state.collectibles)) {
            this.state.collectibles = [];
        }
        if (!Array.isArray(this.state.challenges)) {
            this.state.challenges = [];
        }
        if (!Array.isArray(this.state.unlockedAchievements)) {
            this.state.unlockedAchievements = [];
        }

        audio.muted = !!this.state.audioMuted;

        // Offline decay calculation
        if (this.state.lastActiveTime) {
            const elapsedMs = Date.now() - this.state.lastActiveTime;
            if (elapsedMs > 0) {
                const decayTicks = Math.floor(elapsedMs / this.happinessDecayIntervalMs);
                this.state.currentHappiness = Math.max(0, this.state.currentHappiness - (decayTicks * this.happinessDecayRate));
            }
        }
        this.state.lastActiveTime = Date.now();
        this.saveState();
    }

    saveState() {
        this.state.lastActiveTime = Date.now();
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.state));
        } catch (e) {
            console.error("Failed to save state to localStorage", e);
        }
    }

    cacheDOM() {
        this.dom = {
            themeSwitcher: document.getElementById('theme-switcher'),
            btnMute: document.getElementById('btn-mute'),
            btnFloating: document.getElementById('btn-floating'),
            btnUnfloat: document.getElementById('btnUnfloat') || document.getElementById('btn-unfloat'),
            btnFwTask: document.getElementById('btn-fw-task'),
            fwXp: document.getElementById('fw-xp'),
            fwLevel: document.getElementById('fw-level'),
            floatingWidget: document.getElementById('floating-widget'),
            btnExport: document.getElementById('btn-export'),
            btnImport: document.getElementById('btn-import'),
            btnReset: document.getElementById('btn-reset'),
            parallaxBg: document.getElementById('parallax-bg'),
            levelDisplay: document.getElementById('level-display'),
            xpText: document.getElementById('xp-text'),
            xpBar: document.getElementById('xp-bar'),
            xpContainer: document.getElementById('xp-container'),
            happinessText: document.getElementById('happiness-text'),
            happinessBar: document.getElementById('happiness-bar'),
            happinessContainer: document.getElementById('happiness-container'),
            coinsDisplay: document.getElementById('coins-display'),
            streakDisplay: document.getElementById('streak-display'),
            longestStreakDisplay: document.getElementById('longest-streak-display'),
            totalTasksDisplay: document.getElementById('total-tasks-display'),
            pomoTime: document.getElementById('pomodoro-time'),
            pomo25: document.getElementById('btn-pomo-25'),
            pomo50: document.getElementById('btn-pomo-50'),
            pomoStart: document.getElementById('btn-pomo-start'),
            pomoStop: document.getElementById('btn-pomo-stop'),
            btnTask: document.getElementById('btn-task'),
            petContainer: document.getElementById('pet-container'),
            mouth: document.getElementById('mouth'),
            particleContainer: document.getElementById('particle-container'),
            sleepParticles: document.getElementById('sleep-particles'),
            dialogueBubble: document.getElementById('dialogue-bubble'),
            eventContainer: document.getElementById('event-container'),
            acc: {
                hat: document.getElementById('acc-hat'),
                hat2: document.getElementById('acc-hat2'),
                glasses: document.getElementById('acc-glasses'),
                shades2: document.getElementById('acc-shades2'),
                crown: document.getElementById('acc-crown')
            },
            tabBtns: document.querySelectorAll('.tab-btn'),
            tabContents: document.querySelectorAll('.tab-content'),
            shopGrid: document.getElementById('shop-grid'),
            invGrid: document.getElementById('inventory-grid'),
            colGrid: document.getElementById('collectibles-grid'),
            chalList: document.getElementById('challenges-list'),
            achList: document.getElementById('achievements-list'),
            dash: {
                tasks: document.getElementById('dash-tasks'),
                xp: document.getElementById('dash-xp'),
                level: document.getElementById('dash-level'),
                happiness: document.getElementById('dash-happiness'),
                coins: document.getElementById('dash-coins'),
                streak: document.getElementById('dash-streak'),
                achievements: document.getElementById('dash-achievements'),
                playtime: document.getElementById('dash-playtime')
            },
            modalOverlay: document.getElementById('modal-overlay'),
            modalLevel: document.getElementById('modal-level'),
            btnCloseModal: document.getElementById('btn-close-modal'),
            toastContainer: document.getElementById('toast-container'),
            canvas: document.getElementById('pet-atmosphere')
        };
    }

    bindEvents() {
        if (this.dom.btnTask) {
            this.dom.btnTask.addEventListener('click', (e) => {
                audio.play('click');
                this.completeTask(e);
            });
        }

        if (this.dom.btnFwTask) {
            this.dom.btnFwTask.addEventListener('click', (e) => {
                audio.play('click');
                this.completeTask(e);
            });
        }

        document.addEventListener('click', () => {
            this.resetSleepTimer();
            if (this.isSleeping) this.wakeUp();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.dom.modalOverlay && !this.dom.modalOverlay.classList.contains('hidden')) {
                this.dom.modalOverlay.classList.add('hidden');
                audio.play('click');
            }
        });

        // Tab selection
        this.dom.tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget;
                audio.play('click');
                this.dom.tabBtns.forEach(b => {
                    b.classList.remove('active');
                    b.setAttribute('aria-selected', 'false');
                });
                this.dom.tabContents.forEach(c => c.classList.remove('active'));

                target.classList.add('active');
                target.setAttribute('aria-selected', 'true');
                const targetTabId = `tab-${target.getAttribute('data-tab')}`;
                const targetPanel = document.getElementById(targetTabId);
                if (targetPanel) {
                    targetPanel.classList.add('active');
                }
            });
        });

        // Pomodoro buttons
        if (this.dom.pomo25) this.dom.pomo25.addEventListener('click', () => this.setPomo(25));
        if (this.dom.pomo50) this.dom.pomo50.addEventListener('click', () => this.setPomo(50));
        if (this.dom.pomoStart) this.dom.pomoStart.addEventListener('click', () => this.startPomo());
        if (this.dom.pomoStop) this.dom.pomoStop.addEventListener('click', () => this.stopPomo());

        // Navigation controls
        if (this.dom.themeSwitcher) {
            this.dom.themeSwitcher.addEventListener('change', (e) => {
                this.state.theme = e.target.value;
                this.applyTheme();
                this.saveState();
            });
        }

        if (this.dom.btnMute) {
            this.dom.btnMute.addEventListener('click', () => {
                this.state.audioMuted = !this.state.audioMuted;
                audio.muted = this.state.audioMuted;
                this.dom.btnMute.textContent = this.state.audioMuted ? '🔇' : '🔊';
                this.saveState();
            });
        }

        if (this.dom.btnExport) {
            this.dom.btnExport.addEventListener('click', () => this.exportSave());
        }

        if (this.dom.btnImport) {
            this.dom.btnImport.addEventListener('change', (e) => this.importSave(e));
            // Keyboard accessibility for import label wrapper
            const importLabel = this.dom.btnImport.parentElement;
            if (importLabel) {
                importLabel.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        this.dom.btnImport.click();
                    }
                });
            }
        }

        if (this.dom.btnReset) {
            this.dom.btnReset.addEventListener('click', () => {
                if (confirm("Are you sure? This deletes ALL progress!")) {
                    localStorage.removeItem(this.storageKey);
                    location.reload();
                }
            });
        }

        if (this.dom.btnFloating) {
            this.dom.btnFloating.addEventListener('click', () => {
                document.body.classList.add('floating-active');
                audio.play('click');
            });
        }

        if (this.dom.btnUnfloat) {
            this.dom.btnUnfloat.addEventListener('click', () => {
                document.body.classList.remove('floating-active');
                audio.play('click');
            });
        }

        if (this.dom.btnCloseModal) {
            this.dom.btnCloseModal.addEventListener('click', () => {
                this.dom.modalOverlay.classList.add('hidden');
                audio.play('click');
            });
        }

        window.addEventListener('beforeunload', () => {
            this.saveState();
        });
    }

    // --- Micro-Interactions ---
    initRipples() {
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('button, .retro-button, .toggle-btn');
            if (btn) {
                const rect = btn.getBoundingClientRect();
                const ripple = document.createElement('span');
                ripple.className = 'ripple';
                const size = Math.max(rect.width, rect.height);
                ripple.style.width = ripple.style.height = `${size}px`;
                ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
                ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
                btn.appendChild(ripple);
                setTimeout(() => ripple.remove(), 600);
            }
        });
    }

    animateValue(el, start, end, duration) {
        if (!el) return;
        if (start === end) {
            el.textContent = end;
            return;
        }
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            el.textContent = Math.floor(progress * (end - start) + start);
            if (progress < 1) {
                window.requestAnimationFrame(step);
            } else {
                el.textContent = end;
                el.style.transform = 'scale(1)';
            }
        };
        el.style.transform = 'scale(1.15)';
        window.requestAnimationFrame(step);
    }

    initAtmosphere() {
        if (!this.dom.canvas || !this.dom.canvas.parentElement) return;
        const ctx = this.dom.canvas.getContext('2d');
        if (!ctx) return;

        const updateSize = () => {
            const width = this.dom.canvas.parentElement.clientWidth || 300;
            const height = this.dom.canvas.parentElement.clientHeight || 300;
            this.dom.canvas.width = width;
            this.dom.canvas.height = height;
            return { width, height };
        };

        let { width, height } = updateSize();
        window.addEventListener('resize', () => {
            const dims = updateSize();
            width = dims.width;
            height = dims.height;
        });

        const particles = [];
        for (let i = 0; i < 30; i++) {
            particles.push({
                x: Math.random() * width,
                y: Math.random() * height,
                s: Math.random() * 2 + 1,
                dy: Math.random() * -0.5 - 0.1,
                alpha: Math.random() * 0.5
            });
        }

        const draw = () => {
            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = this.canvasAccentColor;
            particles.forEach(p => {
                ctx.globalAlpha = p.alpha;
                ctx.fillRect(p.x, p.y, p.s, p.s);
                p.y += p.dy;
                if (p.y < 0) {
                    p.y = height;
                    p.x = Math.random() * width;
                }
            });
            requestAnimationFrame(draw);
        };
        draw();
    }

    spawnConfetti() {
        for (let i = 0; i < 40; i++) {
            const c = document.createElement('div');
            c.className = 'confetti';
            c.style.backgroundColor = ['#FF0055', '#00F0FF', '#39FF14', '#FFB800'][Math.floor(Math.random() * 4)];
            c.style.left = `${Math.random() * 100}vw`;
            c.style.top = `-10px`;
            c.style.animationDuration = `${Math.random() * 2 + 1}s`;
            c.style.animationDelay = `${Math.random() * 0.5}s`;
            document.body.appendChild(c);
            setTimeout(() => c.remove(), 3000);
        }
    }

    showToast(type, message) {
        if (!this.dom.toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        const icons = { success: '✓', warning: '⚠️', achievement: '🏆', error: '✕' };
        toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ'}</span> <div>${message}</div>`;
        this.dom.toastContainer.appendChild(toast);
        if (type === 'achievement') this.spawnConfetti();
        setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, 4000);
    }

    // --- Core Loops ---
    startLoops() {
        clearInterval(this.decayInterval);
        clearInterval(this.playtimeInterval);
        clearInterval(this.dialogueInterval);
        clearInterval(this.eventInterval);

        this.decayInterval = setInterval(() => {
            if (this.state.currentHappiness > 0) {
                this.state.currentHappiness = Math.max(0, this.state.currentHappiness - this.happinessDecayRate);
                this.updateHappinessUI();
                this.updateExpression();
            }
        }, this.happinessDecayIntervalMs);

        this.playtimeInterval = setInterval(() => {
            this.state.stats.playtimeSeconds++;
            this.updatePlaytimeUI();
        }, 1000);

        this.dialogueInterval = setInterval(() => this.showDialogue(), 25000);
        this.eventInterval = setInterval(() => this.triggerRandomEvent(), 50000);
    }

    updatePlaytimeUI() {
        if (!this.dom.dash.playtime) return;
        const secs = this.state.stats.playtimeSeconds || 0;
        const mins = Math.floor(secs / 60);
        const hrs = Math.floor(mins / 60);
        if (hrs > 0) {
            this.dom.dash.playtime.textContent = `${hrs}h ${mins % 60}m`;
        } else {
            this.dom.dash.playtime.textContent = `${mins}m`;
        }
    }

    // --- Daily Streak Calculation (Deterministic & Bug-Free) ---
    checkDailyStreak() {
        const todayStr = new Date().toISOString().split('T')[0];
        if (!this.state.lastTaskDate) return;
        if (this.state.lastTaskDate === todayStr) return;

        const lastDate = new Date(this.state.lastTaskDate + 'T00:00:00');
        const todayDate = new Date(todayStr + 'T00:00:00');
        const diffDays = Math.round((todayDate - lastDate) / 86400000);

        // If more than 1 day skipped, streak was broken
        if (diffDays > 1) {
            if (this.state.streak > 0) {
                this.state.streak = 0;
                this.showToast('warning', '🧊 Streak lost.');
                this.saveState();
            }
        }
    }

    completeTask(e) {
        const todayStr = new Date().toISOString().split('T')[0];

        // Process daily streak safely
        if (this.state.lastTaskDate !== todayStr) {
            if (!this.state.lastTaskDate) {
                this.state.streak = 1;
            } else {
                const lastDate = new Date(this.state.lastTaskDate + 'T00:00:00');
                const todayDate = new Date(todayStr + 'T00:00:00');
                const diffDays = Math.round((todayDate - lastDate) / 86400000);
                if (diffDays === 1) {
                    this.state.streak += 1;
                    this.showToast('success', `🔥 Streak kept! Day ${this.state.streak}`);
                } else {
                    this.state.streak = 1;
                }
            }
            this.state.lastTaskDate = todayStr;
            this.state.longestStreak = Math.max(this.state.longestStreak, this.state.streak);
        }

        const oldXp = this.state.currentXp;
        const oldCoins = this.state.coins;
        const oldTasks = this.state.totalTasksCompleted;

        this.state.totalTasksCompleted += 1;
        this.state.currentHappiness = Math.min(100, this.state.currentHappiness + 10);
        const xpGained = 20;
        const coinsGained = 5 + Math.floor(this.state.streak / 2);
        this.state.currentXp += xpGained;
        this.state.coins += coinsGained;

        const posX = e && e.clientX ? e.clientX : window.innerWidth / 2;
        const posY = e && e.clientY ? e.clientY : window.innerHeight / 2;
        this.spawnFloatingText(`+${xpGained}XP / +${coinsGained}🪙`, posX, posY);

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
        if (this.dom.modalLevel) this.dom.modalLevel.textContent = this.state.level;
        if (this.dom.modalOverlay) this.dom.modalOverlay.classList.remove('hidden');
        this.spawnSparkles();
        this.checkUnlocks();
        this.updateEvolution();
        audio.play('level');
        this.updateChallengeProgress('levels', 1);
    }

    updateEvolution() {
        // Safe class update: remove only evolution classes without destroying active mood classes!
        this.dom.petContainer.classList.remove('evo-junior', 'evo-advanced', 'evo-legendary');
        if (this.state.level >= 50) this.dom.petContainer.classList.add('evo-legendary');
        else if (this.state.level >= 30) this.dom.petContainer.classList.add('evo-advanced');
        else if (this.state.level >= 10) this.dom.petContainer.classList.add('evo-junior');
    }

    // --- Moods & Sleep ---
    resetSleepTimer() {
        clearTimeout(this.sleepTimer);
        this.sleepTimer = setTimeout(() => this.goSleep(), this.sleepTimeoutMs);
    }

    goSleep() {
        this.isSleeping = true;
        this.setPetMood('sleeping');
        this.dom.sleepParticles.innerHTML = '';
        this.dom.sleepParticles.classList.remove('hidden');
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                if (!this.isSleeping) return;
                const zzz = document.createElement('div');
                zzz.className = 'zzz-particle';
                zzz.textContent = 'Zzz';
                zzz.style.left = `${60 + Math.random() * 20}%`;
                zzz.style.top = `${20 + Math.random() * 20}%`;
                this.dom.sleepParticles.appendChild(zzz);
                setTimeout(() => { if (zzz.parentNode) zzz.remove(); }, 3000);
            }, i * 1000);
        }
    }

    wakeUp() {
        this.isSleeping = false;
        this.dom.sleepParticles.classList.add('hidden');
        this.dom.sleepParticles.innerHTML = '';
        this.setPetMood('idle');
    }

    setPetMood(mood) {
        this.dom.petContainer.classList.remove(
            'state-idle', 'state-happy', 'state-excited', 'state-curious',
            'state-focused', 'state-tired', 'state-bored', 'state-sleeping'
        );
        this.dom.petContainer.classList.add(`state-${mood}`);
    }

    tempPetMood(mood, durationMs) {
        clearTimeout(this.petStateTimeout);
        this.setPetMood(mood);
        this.petStateTimeout = setTimeout(() => {
            if (!this.isSleeping) this.setPetMood('idle');
        }, durationMs);
    }

    updateExpression() {
        if (!this.dom.mouth) return;
        const h = this.state.currentHappiness;
        if (h >= 75) {
            this.dom.mouth.setAttribute('width', '4');
            this.dom.mouth.setAttribute('height', '2');
            this.dom.mouth.setAttribute('y', '14');
        } else if (h >= 35) {
            this.dom.mouth.setAttribute('width', '4');
            this.dom.mouth.setAttribute('height', '1');
            this.dom.mouth.setAttribute('y', '14');
        } else {
            this.dom.mouth.setAttribute('width', '2');
            this.dom.mouth.setAttribute('height', '1');
            this.dom.mouth.setAttribute('y', '15');
        }
    }

    // --- Pomodoro Focus Timer ---
    setPomo(min) {
        if (this.pomo.active) return;
        this.pomo.selectedMin = min;
        this.pomo.timeRem = min * 60;
        this.updatePomoUI();
        this.updatePomoButtons();
        audio.play('click');
    }

    updatePomoButtons() {
        if (this.dom.pomo25) {
            this.dom.pomo25.classList.toggle('active', this.pomo.selectedMin === 25);
        }
        if (this.dom.pomo50) {
            this.dom.pomo50.classList.toggle('active', this.pomo.selectedMin === 50);
        }
        if (this.dom.pomoStart) {
            this.dom.pomoStart.classList.toggle('active', this.pomo.active);
        }
    }

    startPomo() {
        if (this.pomo.active) return;
        if (this.pomo.timeRem <= 0) {
            this.pomo.timeRem = (this.pomo.selectedMin || 25) * 60;
        }
        this.pomo.active = true;
        this.setPetMood('focused');
        audio.play('click');
        this.updatePomoButtons();

        clearInterval(this.pomoInterval);
        this.pomoInterval = setInterval(() => {
            this.pomo.timeRem--;
            this.updatePomoUI();
            if (this.pomo.timeRem <= 0) {
                clearInterval(this.pomoInterval);
                this.completePomo();
            }
        }, 1000);
    }

    stopPomo() {
        this.pomo.active = false;
        clearInterval(this.pomoInterval);
        this.setPetMood('idle');
        this.updatePomoButtons();
        audio.play('click');
    }

    updatePomoUI() {
        if (!this.dom.pomoTime) return;
        const m = Math.floor(Math.max(0, this.pomo.timeRem) / 60).toString().padStart(2, '0');
        const s = (Math.max(0, this.pomo.timeRem) % 60).toString().padStart(2, '0');
        this.dom.pomoTime.textContent = `${m}:${s}`;
    }

    completePomo() {
        this.stopPomo();
        // Reset timer back to duration so user cannot spam zero-second completions
        this.pomo.timeRem = (this.pomo.selectedMin || 25) * 60;
        this.updatePomoUI();

        audio.play('level');
        this.showToast("success", "🍅 Focus Session Complete! +50XP +25🪙");
        this.state.currentXp += 50;
        this.state.coins += 25;
        this.state.currentHappiness = Math.min(100, this.state.currentHappiness + 25);
        this.tempPetMood('happy', 4000);

        if (this.state.currentXp >= this.xpPerLevel) this.levelUp();
        this.updateUI();
        this.saveState();
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
        if (!this.dom.shopGrid) return;
        this.dom.shopGrid.innerHTML = '';
        this.getShopItems().forEach(item => {
            const isOwned = this.state.shopUnlocked.includes(item.id);
            const el = document.createElement('div');
            el.className = `shop-item rarity-epic`;
            el.innerHTML = `
                <div class="inv-icon">🛒</div>
                <div class="inv-details">
                    <span class="inv-name">${item.name}</span>
                    <span class="shop-cost">${isOwned ? 'OWNED' : item.cost + ' 🪙'}</span>
                </div>
                <button class="toggle-btn text-warning" ${isOwned ? 'disabled' : ''}>
                    ${isOwned ? 'BOUGHT' : 'BUY'}
                </button>
            `;
            if (!isOwned) {
                el.querySelector('button').addEventListener('click', () => this.buyItem(item));
            }
            this.dom.shopGrid.appendChild(el);
        });
        this.renderInventory();
    }

    buyItem(item) {
        if (this.state.coins >= item.cost) {
            this.state.coins -= item.cost;
            if (!this.state.shopUnlocked.includes(item.id)) {
                this.state.shopUnlocked.push(item.id);
            }
            audio.play('coin');
            this.showToast('success', `Bought ${item.name}!`);
            this.saveState();
            this.renderShop();
            this.updateUI();
        } else {
            audio.play('error');
            this.showToast("warning", "Not enough coins!");
        }
    }

    renderInventory() {
        if (!this.dom.invGrid) return;
        this.dom.invGrid.innerHTML = '';
        const items = [
            { id: 'acc-hat', name: 'Retro Cap', req: 2, icon: '🧢', type: 'hat' },
            { id: 'acc-glasses', name: 'Cyber Shades', req: 3, icon: '🕶️', type: 'glasses' },
            { id: 'acc-crown', name: '8-bit Crown', req: 5, icon: '👑', type: 'crown' }
        ];

        this.getShopItems().forEach(si => {
            if (this.state.shopUnlocked.includes(si.id)) {
                items.push({ id: si.id, name: si.name, req: 1, icon: '✨', type: si.type, color: si.color });
            }
        });

        items.forEach(item => {
            const isUnlocked = this.state.level >= item.req || this.state.shopUnlocked.includes(item.id);
            const isEquipped = this.state.equippedAccessories[item.type] === item.id;
            const el = document.createElement('div');
            el.className = `inv-slot rarity-common ${isUnlocked ? '' : 'locked'}`;
            el.innerHTML = `
                <div class="inv-icon">${item.icon}</div>
                <div class="inv-details">
                    <span class="inv-name">${item.name}</span>
                    <span class="inv-status">${isUnlocked ? 'Unlocked' : 'Lvl ' + item.req}</span>
                </div>
                <button class="toggle-btn ${isEquipped ? 'equipped' : ''}" ${isUnlocked ? '' : 'disabled'}>
                    ${isEquipped ? 'UNEQUIP' : 'EQUIP'}
                </button>
            `;
            if (isUnlocked) {
                el.querySelector('button').addEventListener('click', () => {
                    audio.play('click');
                    if (isEquipped) {
                        this.state.equippedAccessories[item.type] = false;
                    } else {
                        this.state.equippedAccessories[item.type] = item.id;
                    }
                    this.applyEquippedBackground();
                    this.saveState();
                    this.renderInventory();
                    this.updateAccessoriesUI();
                });
            }
            this.dom.invGrid.appendChild(el);
        });
    }

    applyEquippedBackground() {
        if (!this.dom.parallaxBg) return;
        this.dom.parallaxBg.classList.remove('bg-space-equipped', 'bg-forest-equipped');
        const bg = this.state.equippedAccessories.bg;
        if (bg === 'bg-space') {
            this.dom.parallaxBg.classList.add('bg-space-equipped');
        } else if (bg === 'bg-forest') {
            this.dom.parallaxBg.classList.add('bg-forest-equipped');
        }
    }

    checkUnlocks() {
        this.renderInventory();
        this.updateAccessoriesUI();
    }

    updateAccessoriesUI() {
        // Hat layer
        const hatEquipped = this.state.equippedAccessories.hat;
        if (this.dom.acc.hat) {
            this.dom.acc.hat.classList.toggle('hidden', hatEquipped !== 'acc-hat');
        }
        if (this.dom.acc.hat2) {
            this.dom.acc.hat2.classList.toggle('hidden', hatEquipped !== 'acc-hat2');
        }

        // Glasses layer
        const glassesEquipped = this.state.equippedAccessories.glasses;
        if (this.dom.acc.glasses) {
            this.dom.acc.glasses.classList.toggle('hidden', glassesEquipped !== 'acc-glasses');
        }
        if (this.dom.acc.shades2) {
            this.dom.acc.shades2.classList.toggle('hidden', glassesEquipped !== 'acc-shades2');
        }

        // Crown layer
        const crownEquipped = this.state.equippedAccessories.crown;
        if (this.dom.acc.crown) {
            this.dom.acc.crown.classList.toggle('hidden', crownEquipped !== 'acc-crown');
        }

        this.applyEquippedBackground();
    }

    // --- Collectibles ---
    grantCollectible() {
        const names = ["Golden Floppy", "Debug Duck", "Syntax Potion", "RAM Stick", "Glitch Shard"];
        const rarities = ["common", "common", "rare", "epic", "legendary"];
        const rand = Math.floor(Math.random() * names.length);
        const col = { name: names[rand], rarity: rarities[rand], date: new Date().toLocaleDateString() };
        this.state.collectibles.push(col);
        this.showToast('success', `Loot Found! ${col.name} (${col.rarity}) 🎁`);
        this.renderCollectibles();
        audio.play('level');
        this.saveState();
    }

    renderCollectibles() {
        if (!this.dom.colGrid) return;
        this.dom.colGrid.innerHTML = '';
        if (this.state.collectibles.length === 0) {
            this.dom.colGrid.innerHTML = '<span class="stat-subtext">No collectibles yet... Complete coding tasks!</span>';
            return;
        }
        this.state.collectibles.forEach(c => {
            const el = document.createElement('div');
            el.className = `col-item rarity-${c.rarity}`;
            // Use safe textContent inside spans to prevent DOM injection
            const icon = document.createElement('div');
            icon.className = 'inv-icon';
            icon.textContent = '🎁';

            const details = document.createElement('div');
            details.className = 'inv-details';
            const nameSpan = document.createElement('span');
            nameSpan.className = 'inv-name';
            nameSpan.textContent = c.name;
            const statusSpan = document.createElement('span');
            statusSpan.className = 'inv-status';
            statusSpan.textContent = (c.rarity || 'common').toUpperCase();

            details.appendChild(nameSpan);
            details.appendChild(statusSpan);
            el.appendChild(icon);
            el.appendChild(details);
            this.dom.colGrid.appendChild(el);
        });
    }

    // --- Random Events & Dialogues ---
    showDialogue() {
        if (this.isSleeping || !this.dom.dialogueBubble) return;
        clearTimeout(this.dialogueTimeout);
        const lines = [
            "Let's build something awesome!",
            "One more task!",
            "You're doing great!",
            "Every line of code makes me stronger!",
            "Time for a quick coffee break?"
        ];
        this.dom.dialogueBubble.textContent = lines[Math.floor(Math.random() * lines.length)];
        this.dom.dialogueBubble.classList.remove('hidden');
        this.dialogueTimeout = setTimeout(() => {
            this.dom.dialogueBubble.classList.add('hidden');
        }, 4000);
    }

    triggerRandomEvent() {
        if (this.isSleeping || Math.random() > 0.5 || !this.dom.eventContainer) return;
        clearTimeout(this.eventTimeout);

        this.tempPetMood('curious', 3000);
        const events = [
            { icon: '🐛', name: 'Bug Catch!', reward: 15 },
            { icon: '☕', name: 'Coffee Boost', reward: 10 },
            { icon: '💎', name: 'Lucky Gem', reward: 50 }
        ];
        const ev = events[Math.floor(Math.random() * events.length)];
        this.dom.eventContainer.textContent = ev.icon;
        this.dom.eventContainer.setAttribute('title', `${ev.name} - Click to claim!`);
        this.dom.eventContainer.classList.remove('hidden');

        const clickHandler = (e) => {
            e.stopPropagation();
            clearTimeout(this.eventTimeout);
            this.dom.eventContainer.classList.add('hidden');
            this.dom.eventContainer.removeEventListener('click', clickHandler);

            this.state.coins += ev.reward;
            this.showToast('success', `${ev.name} +${ev.reward}🪙`);
            audio.play('coin');
            this.tempPetMood('happy', 2000);
            this.saveState();
            this.updateUI();
        };

        this.dom.eventContainer.addEventListener('click', clickHandler);
        this.eventTimeout = setTimeout(() => {
            this.dom.eventContainer.classList.add('hidden');
            this.dom.eventContainer.removeEventListener('click', clickHandler);
        }, 10000);
    }

    // --- Challenges ---
    generateChallenges() {
        if (!this.state.challenges || this.state.challenges.length === 0) {
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
            if (!c.done && c.type === type) {
                if (type === 'levels') {
                    c.progress = this.state.level;
                } else {
                    c.progress += amt;
                }
                if (c.progress >= c.target) {
                    c.progress = c.target;
                    c.done = true;
                    this.state.coins += c.reward;
                    this.showToast('achievement', `Challenge Complete! +${c.reward}🪙`);
                    audio.play('level');
                }
                changed = true;
            }
        });
        if (changed) {
            this.saveState();
            this.renderChallenges();
        }
    }

    renderChallenges() {
        if (!this.dom.chalList) return;
        this.dom.chalList.innerHTML = '';
        this.state.challenges.forEach(c => {
            const pct = Math.min(100, (c.progress / c.target) * 100);
            const el = document.createElement('div');
            el.className = `challenge-item ${c.done ? 'completed' : ''}`;
            el.innerHTML = `
                <span class="chal-title">${c.desc} <span>${c.progress}/${c.target}</span></span>
                <span class="stat-subtext">Reward: ${c.reward}🪙 ${c.done ? '✓ COMPLETED' : ''}</span>
                <div class="chal-prog"><div class="chal-prog-fill" style="width: ${pct}%"></div></div>
            `;
            this.dom.chalList.appendChild(el);
        });
    }

    // --- Achievements (Rendered & Unlocked Accurately) ---
    getAchievementsList() {
        return [
            { id: 'ach-1', target: 1, name: 'First Code', desc: 'Complete your 1st coding task', icon: '💻' },
            { id: 'ach-5', target: 5, name: 'Code Monkey', desc: 'Complete 5 coding tasks', icon: '🐒' },
            { id: 'ach-10', target: 10, name: 'Script Kiddie', desc: 'Complete 10 coding tasks', icon: '📜' },
            { id: 'ach-25', target: 25, name: 'Stack Overflow Sr.', desc: 'Complete 25 coding tasks', icon: '⚡' },
            { id: 'ach-50', target: 50, name: 'Linus Mode', desc: 'Complete 50 coding tasks', icon: '🐧' }
        ];
    }

    renderAchievements() {
        if (!this.dom.achList) return;
        this.dom.achList.innerHTML = '';
        const list = this.getAchievementsList();
        list.forEach(ach => {
            const isUnlocked = this.state.unlockedAchievements.includes(ach.id) || this.state.totalTasksCompleted >= ach.target;
            const el = document.createElement('div');
            el.id = ach.id;
            el.className = `achievement ${isUnlocked ? '' : 'locked'}`;
            el.innerHTML = `
                <div class="ach-icon" aria-hidden="true">${ach.icon}</div>
                <div class="ach-text">
                    <strong>${ach.name}</strong>
                    <p class="stat-subtext">${ach.desc}</p>
                </div>
                <span class="inv-status" style="margin-left: auto;">${isUnlocked ? '✓ UNLOCKED' : 'LOCKED'}</span>
            `;
            this.dom.achList.appendChild(el);
        });
    }

    checkAchievements() {
        const tasks = this.state.totalTasksCompleted;
        const list = this.getAchievementsList();
        let anyUnlocked = false;

        list.forEach(ach => {
            if (tasks >= ach.target && !this.state.unlockedAchievements.includes(ach.id)) {
                this.state.unlockedAchievements.push(ach.id);
                this.showToast('achievement', `Achievement Unlocked: ${ach.name} 🏆`);
                audio.play('level');
                anyUnlocked = true;
            }
        });

        if (anyUnlocked) {
            this.saveState();
            this.renderAchievements();
        }
    }

    // --- Save & Load Management ---
    applyTheme() {
        document.body.setAttribute('data-theme', this.state.theme);
        if (this.dom.themeSwitcher) {
            this.dom.themeSwitcher.value = this.state.theme;
        }
        if (this.dom.btnMute) {
            this.dom.btnMute.textContent = this.state.audioMuted ? '🔇' : '🔊';
        }
        // Cache canvas accent color once per theme change
        this.canvasAccentColor = getComputedStyle(document.body).getPropertyValue('--color-accent').trim() || '#00F0FF';
        this.applyEquippedBackground();
    }

    exportSave() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.state, null, 2));
        const anchor = document.createElement('a');
        anchor.setAttribute("href", dataStr);
        anchor.setAttribute("download", `codebuddy_save_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        this.showToast('success', 'Game save exported successfully!');
    }

    importSave(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const parsed = JSON.parse(event.target.result);
                if (!parsed || typeof parsed !== 'object' || typeof parsed.level === 'undefined') {
                    throw new Error("Invalid save schema");
                }
                localStorage.setItem(this.storageKey, JSON.stringify(parsed));
                this.showToast('success', 'Save imported! Reloading...');
                setTimeout(() => location.reload(), 600);
            } catch (err) {
                this.showToast('error', 'Invalid save file format.');
                audio.play('error');
            } finally {
                e.target.value = '';
            }
        };
        reader.readAsText(file);
    }

    // --- Visual Effects ---
    spawnFloatingText(text, x, y) {
        const el = document.createElement('div');
        el.className = 'floating-text';
        el.textContent = text;
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 1500);
    }

    spawnSparkles() {
        if (!this.dom.petContainer) return;
        const rect = this.dom.petContainer.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;

        const burst = document.createElement('div');
        burst.className = 'sparkle-burst';
        burst.style.left = `${cx}px`;
        burst.style.top = `${cy}px`;
        document.body.appendChild(burst);
        setTimeout(() => burst.remove(), 600);

        for (let i = 0; i < 20; i++) {
            const sparkle = document.createElement('div');
            sparkle.className = 'sparkle';
            sparkle.style.left = `${cx}px`;
            sparkle.style.top = `${cy}px`;
            const angle = Math.random() * Math.PI * 2;
            const dist = 50 + Math.random() * 50;
            sparkle.style.setProperty('--tx', `${Math.cos(angle) * dist}px`);
            sparkle.style.setProperty('--ty', `${Math.sin(angle) * dist}px`);
            document.body.appendChild(sparkle);
            setTimeout(() => sparkle.remove(), 600);
        }
    }

    updateHappinessUI() {
        if (this.dom.happinessText) {
            this.dom.happinessText.textContent = Math.floor(this.state.currentHappiness);
        }
        if (this.dom.happinessBar) {
            this.dom.happinessBar.style.width = `${this.state.currentHappiness}%`;
        }
        if (this.dom.happinessContainer) {
            this.dom.happinessContainer.setAttribute('aria-valuenow', Math.floor(this.state.currentHappiness));
        }
    }

    updateUI(instant = false, prevObj = {}) {
        if (this.dom.levelDisplay) this.dom.levelDisplay.textContent = this.state.level;
        if (this.dom.xpBar) this.dom.xpBar.style.width = `${(this.state.currentXp / this.xpPerLevel) * 100}%`;
        if (this.dom.xpContainer) this.dom.xpContainer.setAttribute('aria-valuenow', this.state.currentXp);
        if (this.dom.streakDisplay) this.dom.streakDisplay.textContent = this.state.streak;
        if (this.dom.longestStreakDisplay) this.dom.longestStreakDisplay.textContent = this.state.longestStreak;

        if (this.dom.fwXp) this.dom.fwXp.textContent = this.state.currentXp;
        if (this.dom.fwLevel) this.dom.fwLevel.textContent = this.state.level;

        if (instant) {
            if (this.dom.xpText) this.dom.xpText.textContent = this.state.currentXp;
            if (this.dom.totalTasksDisplay) this.dom.totalTasksDisplay.textContent = this.state.totalTasksCompleted;
            if (this.dom.coinsDisplay) this.dom.coinsDisplay.textContent = this.state.coins;
        } else {
            this.animateValue(this.dom.xpText, prevObj.oldXp || 0, this.state.currentXp, 400);
            this.animateValue(this.dom.totalTasksDisplay, prevObj.oldTasks || 0, this.state.totalTasksCompleted, 300);
            this.animateValue(this.dom.coinsDisplay, prevObj.oldCoins || 0, this.state.coins, 500);
        }

        this.updateHappinessUI();
        this.updateExpression();
        this.updateEvolution();
        this.updatePlaytimeUI();

        // Dashboard statistics
        if (this.dom.dash.tasks) this.dom.dash.tasks.textContent = this.state.totalTasksCompleted;
        if (this.dom.dash.xp) this.dom.dash.xp.textContent = (this.state.level - 1) * this.xpPerLevel + this.state.currentXp;
        if (this.dom.dash.level) this.dom.dash.level.textContent = this.state.level;
        if (this.dom.dash.happiness) this.dom.dash.happiness.textContent = Math.floor(this.state.currentHappiness);
        if (this.dom.dash.coins) this.dom.dash.coins.textContent = this.state.coins;
        if (this.dom.dash.streak) this.dom.dash.streak.textContent = this.state.longestStreak;
        if (this.dom.dash.achievements) this.dom.dash.achievements.textContent = this.state.unlockedAchievements.length;
    }
}

// App Boot
document.addEventListener('DOMContentLoaded', () => {
    window.codeBuddyApp = new CodeBuddy();
});
