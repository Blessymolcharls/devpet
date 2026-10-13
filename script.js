// script.js - CodeBuddy State & Game Logic (DevPet 2.0 Desktop Companion)

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
            tasks: [],
            unlockedAchievements: [],
            equippedAccessories: { hat: false, glasses: false, crown: false, bg: null },
            shopUnlocked: ['acc-hat', 'acc-glasses', 'acc-crown'],
            collectibles: [],
            stats: { playtimeSeconds: 0 },
            challenges: [],
            theme: 'cyberpunk',
            audioMuted: false,
            lastActiveTime: Date.now(),
            cpsProfiles: [],
            activeProfileId: null,
            cps: {
                handle: 'DevCoder#404',
                title: 'Code Apprentice',
                specialty: 'Full-Stack Developer',
                bio: 'Coding alongside my floating desktop companion.',
                github: '',
                leetcode: '',
                codeforces: '',
                badges: ['cps_novice']
            }
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

        // Task UI state
        this.taskFilter = 'all';
        this.taskSort = 'created-desc';
        this.editingTaskId = null;
        this.deletingTaskId = null;

        // CPS UI state
        this.activeCpsSubTab = 'overview';
        this.cpsLeaderboardSort = 'rating';
        this.editingProfileId = null;
        this.deletingProfileId = null;
        this.selectedCpsAvatar = '🤖';

        this.init();
    }

    async init() {
        this.cacheDOM();
        this.initDesktopIntegration();
        this.loadState();
        this.applyTheme();
        this.bindEvents();
        this.initRipples();
        this.initAtmosphere();

        this.checkDailyStreak();
        this.generateChallenges();
        this.renderAchievements();
        this.renderTasks();
        this.renderShop();
        this.renderInventory();
        this.renderCps();
        this.renderCollectibles();

        this.updateUI(true);
        this.checkUnlocks();
        this.startLoops();
        this.resetSleepTimer();
        this.setPetMood('idle');
    }

    // --- Desktop Overlay & IPC Synchronization ---
    initDesktopIntegration() {
        if (window.devPetDesktop) {
            if (this.dom.envModeBadge) {
                this.dom.envModeBadge.textContent = 'DESKTOP COMPANION ACTIVE';
                this.dom.envModeBadge.style.borderColor = 'var(--color-accent)';
                this.dom.envModeBadge.style.color = 'var(--color-accent)';
            }

            // Sync initial state from desktop main process
            window.devPetDesktop.getInitialState().then(desktopState => {
                if (desktopState && typeof desktopState === 'object') {
                    this.mergeState(desktopState);
                    this.updateUI(true);
                    this.renderTasks();
                    this.renderCps();
                    this.renderShop();
                    this.renderInventory();
                }
            }).catch(e => console.error("Initial desktop state fetch error:", e));

            // Listen for state synchronization broadcasted by floating pet
            window.devPetDesktop.onStateUpdated(incomingState => {
                if (incomingState && typeof incomingState === 'object') {
                    this.mergeState(incomingState);
                    this.updateUI(true);
                    this.renderTasks();
                    this.renderCps();
                    this.renderShop();
                    this.renderInventory();
                }
            });
        } else {
            if (this.dom.envModeBadge) {
                this.dom.envModeBadge.textContent = 'WEB BROWSER MODE';
            }
        }
    }

    mergeState(parsed) {
        if (!parsed || typeof parsed !== 'object') return;
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
            },
            cps: {
                ...this.state.cps,
                ...(parsed.cps || {})
            }
        };
        this.sanitizeState();
    }

    loadState() {
        const saved = localStorage.getItem(this.storageKey);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                this.mergeState(parsed);
            } catch (e) {
                console.error("Save load failed, using defaults", e);
            }
        }
        this.sanitizeState();

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

    sanitizeState() {
        this.state.level = Math.max(1, parseInt(this.state.level, 10) || 1);
        this.state.currentXp = Math.max(0, parseInt(this.state.currentXp, 10) || 0);
        this.state.currentHappiness = Math.min(100, Math.max(0, parseFloat(this.state.currentHappiness) || 100));
        this.state.coins = Math.max(0, parseInt(this.state.coins, 10) || 0);
        this.state.streak = Math.max(0, parseInt(this.state.streak, 10) || 0);
        this.state.longestStreak = Math.max(this.state.streak, parseInt(this.state.longestStreak, 10) || 0);
        this.state.totalTasksCompleted = Math.max(0, parseInt(this.state.totalTasksCompleted, 10) || 0);

        if (!Array.isArray(this.state.tasks)) {
            this.state.tasks = [];
        }
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
        if (!Array.isArray(this.state.cpsProfiles)) {
            this.state.cpsProfiles = [];
        }

        // Migrate legacy single cps object if no profiles exist
        if (this.state.cpsProfiles.length === 0 && this.state.cps && typeof this.state.cps === 'object' && this.state.cps.handle) {
            const sanitizedUser = (this.state.cps.handle || 'devcoder').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 20);
            const profile = {
                id: 'prof_default',
                username: sanitizedUser.length >= 3 ? sanitizedUser : 'devcoder',
                displayName: this.state.cps.handle || 'DevCoder',
                avatar: '🤖',
                bio: this.state.cps.bio || 'Coding alongside my floating desktop companion.',
                specialty: this.state.cps.specialty || 'Full-Stack Developer',
                github: this.state.cps.github || '',
                leetcode: this.state.cps.leetcode || '',
                codeforces: this.state.cps.codeforces || '',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            this.state.cpsProfiles.push(profile);
            this.state.activeProfileId = profile.id;
        }

        // Resolve active profile ID
        if (this.state.cpsProfiles.length > 0) {
            if (!this.state.activeProfileId || !this.state.cpsProfiles.some(p => p.id === this.state.activeProfileId)) {
                this.state.activeProfileId = this.state.cpsProfiles[0].id;
            }
        } else {
            this.state.activeProfileId = null;
        }

        if (!this.state.cps || typeof this.state.cps !== 'object') {
            this.state.cps = {
                handle: 'DevCoder#404',
                title: 'Code Apprentice',
                specialty: 'Full-Stack Developer',
                bio: 'Coding alongside my floating desktop companion.',
                github: '',
                leetcode: '',
                codeforces: '',
                badges: ['cps_novice']
            };
        }

        audio.muted = !!this.state.audioMuted;
    }

    saveState() {
        this.state.lastActiveTime = Date.now();
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.state));
        } catch (e) {
            console.error("Failed to save state to localStorage", e);
        }

        // Dual sync with Electron main process
        if (window.devPetDesktop) {
            window.devPetDesktop.saveState(this.state).catch(() => {});
        }
    }

    cacheDOM() {
        this.dom = {
            themeSwitcher: document.getElementById('theme-switcher'),
            btnMute: document.getElementById('btn-mute'),
            envModeBadge: document.getElementById('env-mode-badge'),
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
            shopCoinsDisplay: document.getElementById('shop-coins-display'),
            streakDisplay: document.getElementById('streak-display'),
            longestStreakDisplay: document.getElementById('longest-streak-display'),
            totalTasksDisplay: document.getElementById('total-tasks-display'),
            pomoTime: document.getElementById('pomodoro-time'),
            pomo25: document.getElementById('btn-pomo-25'),
            pomo50: document.getElementById('btn-pomo-50'),
            pomoStart: document.getElementById('btn-pomo-start'),
            pomoStop: document.getElementById('btn-pomo-stop'),
            btnTask: document.getElementById('btn-task'),
            btnAddTaskOpen: document.getElementById('btn-add-task-open'),
            btnAddTaskTab: document.getElementById('btn-add-task-tab'),
            tasksList: document.getElementById('tasks-list'),
            taskSortSelect: document.getElementById('task-sort-select'),
            filterChips: document.querySelectorAll('.filter-chip'),
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
            // Task Modal
            taskModalOverlay: document.getElementById('task-modal-overlay'),
            taskModalHeading: document.getElementById('task-modal-heading'),
            taskForm: document.getElementById('task-form'),
            taskTitleInput: document.getElementById('task-title-input'),
            taskTitleError: document.getElementById('task-title-error'),
            taskDescInput: document.getElementById('task-desc-input'),
            taskPrioritySelect: document.getElementById('task-priority-select'),
            taskCategorySelect: document.getElementById('task-category-select'),
            taskDueInput: document.getElementById('task-due-input'),
            taskDurationInput: document.getElementById('task-duration-input'),
            btnCancelTask: document.getElementById('btn-cancel-task'),
            // Delete Modal
            deleteModalOverlay: document.getElementById('delete-modal-overlay'),
            btnCancelDelete: document.getElementById('btn-cancel-delete'),
            btnConfirmDelete: document.getElementById('btn-confirm-delete'),
            // CPS Views, Toolbar & Navigation
            cpsEmptyView: document.getElementById('cps-empty-view'),
            cpsActiveView: document.getElementById('cps-active-view'),
            btnCpsCreateFirst: document.getElementById('btn-cps-create-first'),
            cpsProfileSelect: document.getElementById('cps-profile-select'),
            btnCpsNewProfile: document.getElementById('btn-cps-new-profile'),
            btnEditCps: document.getElementById('btn-edit-cps'),
            btnDeleteCps: document.getElementById('btn-delete-cps'),
            cpsSubnavBtns: document.querySelectorAll('.cps-subnav-btn'),
            cpsSubviews: document.querySelectorAll('.cps-subview'),
            // CPS Overview Elements
            cpsAvatarDisplay: document.getElementById('cps-avatar-display'),
            cpsNameDisplay: document.getElementById('cps-name-display'),
            cpsUsernameDisplay: document.getElementById('cps-username-display'),
            cpsTitleDisplay: document.getElementById('cps-title-display'),
            cpsSpecialtyDisplay: document.getElementById('cps-specialty-display'),
            cpsRatingDisplay: document.getElementById('cps-rating-display'),
            cpsCurrentTierName: document.getElementById('cps-current-tier-name'),
            cpsTierEmblem: document.getElementById('cps-tier-emblem'),
            cpsNextTierName: document.getElementById('cps-next-tier-name'),
            cpsTierProgressBar: document.getElementById('cps-tier-progress-bar'),
            cpsBioDisplay: document.getElementById('cps-bio-display'),
            cpsGithubLink: document.getElementById('cps-github-link'),
            cpsLeetcodeLink: document.getElementById('cps-leetcode-link'),
            cpsCodeforcesLink: document.getElementById('cps-codeforces-link'),
            cpsUidDisplay: document.getElementById('cps-uid-display'),
            // CPS Statistics & Records
            cpsStatTasks: document.getElementById('cps-stat-tasks'),
            cpsStatTotalXp: document.getElementById('cps-stat-total-xp'),
            cpsStatTotalCoins: document.getElementById('cps-stat-total-coins'),
            cpsStatFocusHrs: document.getElementById('cps-stat-focus-hrs'),
            cpsStatCurrStreak: document.getElementById('cps-stat-curr-streak'),
            cpsStatLevel: document.getElementById('cps-stat-level'),
            cpsStatHappiness: document.getElementById('cps-stat-happiness'),
            cpsStatRatingCalc: document.getElementById('cps-stat-rating-calc'),
            cpsStatBestStreak: document.getElementById('cps-stat-best-streak'),
            cpsStatAchCount: document.getElementById('cps-stat-ach-count'),
            cpsStatFirstTask: document.getElementById('cps-stat-first-task'),
            // CPS Local Leaderboard
            leaderboardSortSelect: document.getElementById('leaderboard-sort-select'),
            leaderboardList: document.getElementById('leaderboard-list'),
            // CPS Challenges
            competitiveChallengesList: document.getElementById('competitive-challenges-list'),
            // CPS Modal Elements
            cpsModalOverlay: document.getElementById('cps-modal-overlay'),
            cpsModalHeading: document.getElementById('cps-modal-heading'),
            cpsForm: document.getElementById('cps-form'),
            cpsNameInput: document.getElementById('cps-name-input'),
            cpsNameError: document.getElementById('cps-name-error'),
            cpsUsernameInput: document.getElementById('cps-username-input'),
            cpsUsernameError: document.getElementById('cps-username-error'),
            avatarOptBtns: document.querySelectorAll('.avatar-opt-btn'),
            cpsSpecialtyInput: document.getElementById('cps-specialty-input'),
            cpsBioInput: document.getElementById('cps-bio-input'),
            cpsGithubInput: document.getElementById('cps-github-input'),
            cpsLeetcodeInput: document.getElementById('cps-leetcode-input'),
            cpsCodeforcesInput: document.getElementById('cps-codeforces-input'),
            btnCancelCps: document.getElementById('btn-cancel-cps'),
            // CPS Delete Modal
            cpsDeleteModalOverlay: document.getElementById('cps-delete-modal-overlay'),
            btnCancelDeleteCps: document.getElementById('btn-cancel-delete-cps'),
            btnConfirmDeleteCps: document.getElementById('btn-confirm-delete-cps'),
            toastContainer: document.getElementById('toast-container'),
            canvas: document.getElementById('pet-atmosphere')
        };
    }

    bindEvents() {
        // Quick complete task button
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

        // Add task modal triggers
        if (this.dom.btnAddTaskOpen) {
            this.dom.btnAddTaskOpen.addEventListener('click', () => {
                audio.play('click');
                this.openTaskModal();
            });
        }
        if (this.dom.btnAddTaskTab) {
            this.dom.btnAddTaskTab.addEventListener('click', () => {
                audio.play('click');
                this.openTaskModal();
            });
        }

        // Task Form Submission & Cancel
        if (this.dom.taskForm) {
            this.dom.taskForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveTaskForm();
            });
        }
        if (this.dom.btnCancelTask) {
            this.dom.btnCancelTask.addEventListener('click', () => {
                audio.play('click');
                this.closeTaskModal();
            });
        }

        // Task filter chips & sort select
        if (this.dom.filterChips) {
            this.dom.filterChips.forEach(chip => {
                chip.addEventListener('click', (e) => {
                    audio.play('click');
                    this.dom.filterChips.forEach(c => c.classList.remove('active'));
                    e.currentTarget.classList.add('active');
                    this.taskFilter = e.currentTarget.getAttribute('data-filter') || 'all';
                    this.renderTasks();
                });
            });
        }
        if (this.dom.taskSortSelect) {
            this.dom.taskSortSelect.addEventListener('change', (e) => {
                audio.play('click');
                this.taskSort = e.target.value;
                this.renderTasks();
            });
        }

        // Delete Task Confirmation Modal
        if (this.dom.btnCancelDelete) {
            this.dom.btnCancelDelete.addEventListener('click', () => {
                audio.play('click');
                this.closeDeleteModal();
            });
        }
        if (this.dom.btnConfirmDelete) {
            this.dom.btnConfirmDelete.addEventListener('click', () => {
                audio.play('click');
                if (this.deletingTaskId) {
                    this.deleteTask(this.deletingTaskId);
                }
                this.closeDeleteModal();
            });
        }

        // CPS Profile Management & Toolbar
        if (this.dom.btnCpsCreateFirst) {
            this.dom.btnCpsCreateFirst.addEventListener('click', () => {
                audio.play('click');
                this.openCpsModal();
            });
        }
        if (this.dom.btnCpsNewProfile) {
            this.dom.btnCpsNewProfile.addEventListener('click', () => {
                audio.play('click');
                this.openCpsModal();
            });
        }
        if (this.dom.btnEditCps) {
            this.dom.btnEditCps.addEventListener('click', () => {
                audio.play('click');
                const active = this.getActiveCpsProfile();
                this.openCpsModal(active);
            });
        }
        if (this.dom.btnDeleteCps) {
            this.dom.btnDeleteCps.addEventListener('click', () => {
                audio.play('click');
                if (this.state.activeProfileId) {
                    this.openDeleteCpsModal(this.state.activeProfileId);
                }
            });
        }
        if (this.dom.cpsProfileSelect) {
            this.dom.cpsProfileSelect.addEventListener('change', (e) => {
                audio.play('click');
                this.switchActiveCpsProfile(e.target.value);
            });
        }

        // CPS Sub-Navigation
        if (this.dom.cpsSubnavBtns) {
            this.dom.cpsSubnavBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    audio.play('click');
                    const sub = e.currentTarget.getAttribute('data-cps-sub');
                    this.switchCpsSubTab(sub);
                });
            });
        }

        // Leaderboard Sort
        if (this.dom.leaderboardSortSelect) {
            this.dom.leaderboardSortSelect.addEventListener('change', (e) => {
                audio.play('click');
                this.cpsLeaderboardSort = e.target.value;
                this.renderCpsLeaderboard();
            });
        }

        // Avatar Picker in CPS Modal
        if (this.dom.avatarOptBtns) {
            this.dom.avatarOptBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    audio.play('click');
                    this.dom.avatarOptBtns.forEach(b => b.classList.remove('active'));
                    e.currentTarget.classList.add('active');
                    this.selectedCpsAvatar = e.currentTarget.getAttribute('data-avatar') || '🤖';
                });
            });
        }

        // CPS Form Submission & Cancel
        if (this.dom.cpsForm) {
            this.dom.cpsForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveCpsForm();
            });
        }
        if (this.dom.btnCancelCps) {
            this.dom.btnCancelCps.addEventListener('click', () => {
                audio.play('click');
                this.closeCpsModal();
            });
        }

        // CPS Delete Confirmation
        if (this.dom.btnCancelDeleteCps) {
            this.dom.btnCancelDeleteCps.addEventListener('click', () => {
                audio.play('click');
                this.closeDeleteCpsModal();
            });
        }
        if (this.dom.btnConfirmDeleteCps) {
            this.dom.btnConfirmDeleteCps.addEventListener('click', () => {
                audio.play('click');
                if (this.deletingProfileId) {
                    this.confirmDeleteCps();
                }
            });
        }

        // Activity resets
        document.addEventListener('click', () => {
            this.resetSleepTimer();
            if (this.isSleeping) this.wakeUp();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.dom.modalOverlay && !this.dom.modalOverlay.classList.contains('hidden')) {
                    this.dom.modalOverlay.classList.add('hidden');
                    audio.play('click');
                }
                if (this.dom.taskModalOverlay && !this.dom.taskModalOverlay.classList.contains('hidden')) {
                    this.closeTaskModal();
                }
                if (this.dom.cpsModalOverlay && !this.dom.cpsModalOverlay.classList.contains('hidden')) {
                    this.closeCpsModal();
                }
                if (this.dom.cpsDeleteModalOverlay && !this.dom.cpsDeleteModalOverlay.classList.contains('hidden')) {
                    this.closeDeleteCpsModal();
                }
                if (this.dom.deleteModalOverlay && !this.dom.deleteModalOverlay.classList.contains('hidden')) {
                    this.closeDeleteModal();
                }
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

        // Theme Switcher & Mute
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

        // Float Mode Button
        if (this.dom.btnFloating) {
            this.dom.btnFloating.addEventListener('click', () => {
                audio.play('click');
                if (window.devPetDesktop) {
                    window.devPetDesktop.showPet();
                    this.showToast('info', 'Desktop Pet brought to front! 🐾');
                } else {
                    document.body.classList.add('floating-active');
                    this.showToast('info', 'Browser mini widget active');
                }
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

    // --- Micro-Interactions & FX ---
    initRipples() {
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('button, .retro-button, .toggle-btn, .filter-chip');
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
        const icons = { success: '✓', warning: '⚠️', achievement: '🏆', error: '✕', info: 'ℹ' };
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

    // --- Daily Streak Calculation ---
    checkDailyStreak() {
        const todayStr = new Date().toISOString().split('T')[0];
        if (!this.state.lastTaskDate) return;
        if (this.state.lastTaskDate === todayStr) return;

        const lastDate = new Date(this.state.lastTaskDate + 'T00:00:00');
        const todayDate = new Date(todayStr + 'T00:00:00');
        const diffDays = Math.round((todayDate - lastDate) / 86400000);

        if (diffDays > 1) {
            if (this.state.streak > 0) {
                this.state.streak = 0;
                this.showToast('warning', '🧊 Streak lost.');
                this.saveState();
            }
        }
    }

    // --- Task Rewards & Idempotency ---
    awardTaskReward(e) {
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
        this.renderCps();
        this.saveState();
    }

    // Quick complete task button handler
    completeTask(e) {
        // Find first active task in task list
        const activeTask = this.state.tasks.find(t => !t.completed);
        if (activeTask) {
            activeTask.completed = true;
            activeTask.completedAt = new Date().toISOString();
            if (!activeTask.rewardClaimed) {
                activeTask.rewardClaimed = true;
                this.awardTaskReward(e);
                this.showToast('success', `Task completed: "${activeTask.title}"! 🎉`);
            }
            this.renderTasks();
        } else {
            // General quick coding task
            this.awardTaskReward(e);
            this.showToast('success', 'Logged coding task progress! ✨');
        }
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
        this.renderCps();
    }

    updateEvolution() {
        this.dom.petContainer.classList.remove('evo-junior', 'evo-advanced', 'evo-legendary');
        if (this.state.level >= 50) this.dom.petContainer.classList.add('evo-legendary');
        else if (this.state.level >= 30) this.dom.petContainer.classList.add('evo-advanced');
        else if (this.state.level >= 10) this.dom.petContainer.classList.add('evo-junior');
    }

    // --- Task Management (CRUD, Validation & Filtering) ---
    renderTasks() {
        if (!this.dom.tasksList) return;
        this.dom.tasksList.innerHTML = '';

        let filtered = [...this.state.tasks];

        // Filter
        if (this.taskFilter === 'active') {
            filtered = filtered.filter(t => !t.completed);
        } else if (this.taskFilter === 'completed') {
            filtered = filtered.filter(t => t.completed);
        } else if (this.taskFilter === 'high') {
            filtered = filtered.filter(t => t.priority === 'high');
        }

        // Sort
        filtered.sort((a, b) => {
            if (this.taskSort === 'created-desc') {
                return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
            } else if (this.taskSort === 'created-asc') {
                return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
            } else if (this.taskSort === 'priority-desc') {
                const pWeights = { high: 3, medium: 2, low: 1 };
                return (pWeights[b.priority] || 0) - (pWeights[a.priority] || 0);
            } else if (this.taskSort === 'due-date-asc') {
                if (!a.dueDate) return 1;
                if (!b.dueDate) return -1;
                return new Date(a.dueDate) - new Date(b.dueDate);
            }
            return 0;
        });

        if (filtered.length === 0) {
            this.dom.tasksList.innerHTML = `
                <div class="tasks-empty-state">
                    <p>No tasks found in this view.</p>
                    <button id="btn-empty-add-task" class="toggle-btn text-accent" style="margin-top: 8px;">➕ Create a Task</button>
                </div>
            `;
            const emptyAddBtn = document.getElementById('btn-empty-add-task');
            if (emptyAddBtn) {
                emptyAddBtn.addEventListener('click', () => this.openTaskModal());
            }
            return;
        }

        const now = new Date().toISOString().split('T')[0];

        filtered.forEach(task => {
            const isOverdue = !task.completed && task.dueDate && task.dueDate < now;
            const card = document.createElement('div');
            card.className = `task-card ${task.completed ? 'completed' : ''} ${isOverdue ? 'overdue' : ''}`;
            
            const dueDisplay = task.dueDate ? `📅 Due: ${task.dueDate}` : '';
            const durationDisplay = task.estimatedMinutes ? `⏱️ ${task.estimatedMinutes}m` : '';

            card.innerHTML = `
                <button class="task-check-btn" aria-label="${task.completed ? 'Mark task incomplete' : 'Mark task complete'}">
                    ✓
                </button>
                <div class="task-card-content">
                    <div class="task-card-header">
                        <span class="task-card-title">${this.escapeHtml(task.title)}</span>
                        <span class="task-priority-chip priority-${task.priority || 'medium'}">${task.priority || 'medium'}</span>
                        <span class="task-category-chip">${this.escapeHtml(task.category || 'General')}</span>
                    </div>
                    ${task.description ? `<p class="task-card-desc">${this.escapeHtml(task.description)}</p>` : ''}
                    <div class="task-card-meta">
                        ${dueDisplay ? `<span>${dueDisplay}</span>` : ''}
                        ${durationDisplay ? `<span>${durationDisplay}</span>` : ''}
                        ${isOverdue ? `<span class="text-error">⚠️ Overdue</span>` : ''}
                    </div>
                </div>
                <div class="task-card-actions">
                    <button class="btn-task-action edit" title="Edit Task" aria-label="Edit Task">✏️</button>
                    <button class="btn-task-action delete" title="Delete Task" aria-label="Delete Task">🗑️</button>
                </div>
            `;

            // Toggle complete
            card.querySelector('.task-check-btn').addEventListener('click', (e) => {
                this.toggleTaskCompletion(task.id, e);
            });

            // Edit
            card.querySelector('.btn-task-action.edit').addEventListener('click', () => {
                this.openTaskModal(task);
            });

            // Delete
            card.querySelector('.btn-task-action.delete').addEventListener('click', () => {
                this.openDeleteModal(task.id);
            });

            this.dom.tasksList.appendChild(card);
        });
    }

    toggleTaskCompletion(taskId, e) {
        const task = this.state.tasks.find(t => t.id === taskId);
        if (!task) return;

        audio.play('click');
        if (!task.completed) {
            task.completed = true;
            task.completedAt = new Date().toISOString();
            // Reward issued only once per task!
            if (!task.rewardClaimed) {
                task.rewardClaimed = true;
                this.awardTaskReward(e);
                this.showToast('success', `Completed: "${task.title}"!`);
            } else {
                this.showToast('info', `Marked "${task.title}" as completed.`);
            }
        } else {
            // Reversible completion: reward is NOT duplicated upon recheck
            task.completed = false;
            task.completedAt = null;
            this.showToast('info', `Reopened: "${task.title}".`);
        }

        this.saveState();
        this.renderTasks();
    }

    openTaskModal(taskToEdit = null) {
        if (!this.dom.taskModalOverlay) return;

        if (this.dom.taskTitleError) {
            this.dom.taskTitleError.classList.add('hidden');
        }

        if (taskToEdit) {
            this.editingTaskId = taskToEdit.id;
            this.dom.taskModalHeading.textContent = 'EDIT TASK';
            this.dom.taskTitleInput.value = taskToEdit.title || '';
            this.dom.taskDescInput.value = taskToEdit.description || '';
            this.dom.taskPrioritySelect.value = taskToEdit.priority || 'medium';
            this.dom.taskCategorySelect.value = taskToEdit.category || 'Feature';
            this.dom.taskDueInput.value = taskToEdit.dueDate || '';
            this.dom.taskDurationInput.value = taskToEdit.estimatedMinutes || '';
        } else {
            this.editingTaskId = null;
            this.dom.taskModalHeading.textContent = 'ADD NEW TASK';
            this.dom.taskTitleInput.value = '';
            this.dom.taskDescInput.value = '';
            this.dom.taskPrioritySelect.value = 'medium';
            this.dom.taskCategorySelect.value = 'Feature';
            this.dom.taskDueInput.value = '';
            this.dom.taskDurationInput.value = '';
        }

        this.dom.taskModalOverlay.classList.remove('hidden');
        this.dom.taskTitleInput.focus();
    }

    closeTaskModal() {
        if (this.dom.taskModalOverlay) {
            this.dom.taskModalOverlay.classList.add('hidden');
        }
        this.editingTaskId = null;
    }

    saveTaskForm() {
        const title = (this.dom.taskTitleInput.value || '').trim();
        if (!title) {
            if (this.dom.taskTitleError) {
                this.dom.taskTitleError.classList.remove('hidden');
            }
            audio.play('error');
            return;
        }

        if (this.dom.taskTitleError) {
            this.dom.taskTitleError.classList.add('hidden');
        }

        const description = (this.dom.taskDescInput.value || '').trim();
        const priority = this.dom.taskPrioritySelect.value || 'medium';
        const category = this.dom.taskCategorySelect.value || 'General';
        const dueDate = this.dom.taskDueInput.value || null;
        const estimatedMinutes = parseInt(this.dom.taskDurationInput.value, 10);
        const validDuration = (!isNaN(estimatedMinutes) && estimatedMinutes > 0) ? estimatedMinutes : null;

        if (this.editingTaskId) {
            const task = this.state.tasks.find(t => t.id === this.editingTaskId);
            if (task) {
                task.title = title;
                task.description = description;
                task.priority = priority;
                task.category = category;
                task.dueDate = dueDate;
                task.estimatedMinutes = validDuration;
                this.showToast('success', 'Task updated! ✏️');
            }
        } else {
            const newTask = {
                id: `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                title,
                description,
                priority,
                category,
                dueDate,
                estimatedMinutes: validDuration,
                completed: false,
                completedAt: null,
                rewardClaimed: false,
                createdAt: new Date().toISOString()
            };
            this.state.tasks.unshift(newTask);
            this.showToast('success', 'New task added! 📋');
        }

        audio.play('click');
        this.saveState();
        this.renderTasks();
        this.closeTaskModal();
    }

    openDeleteModal(taskId) {
        this.deletingTaskId = taskId;
        if (this.dom.deleteModalOverlay) {
            this.dom.deleteModalOverlay.classList.remove('hidden');
        }
    }

    closeDeleteModal() {
        this.deletingTaskId = null;
        if (this.dom.deleteModalOverlay) {
            this.dom.deleteModalOverlay.classList.add('hidden');
        }
    }

    deleteTask(taskId) {
        const idx = this.state.tasks.findIndex(t => t.id === taskId);
        if (idx !== -1) {
            this.state.tasks.splice(idx, 1);
            this.showToast('info', 'Task deleted.');
            this.saveState();
            this.renderTasks();
        }
    }

    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // --- CPS (Competitive Profiles System) ---
    validateUsername(username, excludeProfileId = null) {
        if (!username || typeof username !== 'string') {
            throw new Error('Username is required');
        }
        const trimmed = username.trim();
        if (trimmed.length < 3 || trimmed.length > 20) {
            throw new Error('Username must be between 3 and 20 characters');
        }
        if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
            throw new Error('Username can only contain alphanumeric characters and underscores');
        }
        const isDuplicate = this.state.cpsProfiles.some(
            p => p.id !== excludeProfileId && p.username.toLowerCase() === trimmed.toLowerCase()
        );
        if (isDuplicate) {
            throw new Error(`Username "${trimmed}" is already taken`);
        }
        return trimmed;
    }

    createCpsProfile(data) {
        const username = this.validateUsername(data?.username);
        const displayName = (data?.displayName || '').trim();
        if (!displayName || displayName.length > 30) {
            throw new Error('Display name must be between 1 and 30 characters');
        }
        const avatar = data?.avatar || '🤖';
        const bio = (data?.bio || '').trim().slice(0, 160);
        const specialty = (data?.specialty || 'Full-Stack Developer').trim();

        const newProfile = {
            id: data?.id || `prof_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            username,
            displayName,
            avatar,
            bio,
            specialty,
            github: (data?.github || '').trim(),
            leetcode: (data?.leetcode || '').trim(),
            codeforces: (data?.codeforces || '').trim(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        if (!Array.isArray(this.state.cpsProfiles)) {
            this.state.cpsProfiles = [];
        }
        this.state.cpsProfiles.push(newProfile);
        this.state.activeProfileId = newProfile.id;
        return newProfile;
    }

    editCpsProfile(profileId, updates) {
        const profile = this.state.cpsProfiles?.find(p => p.id === profileId);
        if (!profile) {
            throw new Error('Profile not found');
        }

        if (updates.username !== undefined) {
            profile.username = this.validateUsername(updates.username, profileId);
        }
        if (updates.displayName !== undefined) {
            const dn = updates.displayName.trim();
            if (!dn || dn.length > 30) {
                throw new Error('Display name must be between 1 and 30 characters');
            }
            profile.displayName = dn;
        }
        if (updates.avatar !== undefined) profile.avatar = updates.avatar;
        if (updates.bio !== undefined) profile.bio = updates.bio.trim().slice(0, 160);
        if (updates.specialty !== undefined) profile.specialty = updates.specialty.trim();
        if (updates.github !== undefined) profile.github = updates.github.trim();
        if (updates.leetcode !== undefined) profile.leetcode = updates.leetcode.trim();
        if (updates.codeforces !== undefined) profile.codeforces = updates.codeforces.trim();
        profile.updatedAt = new Date().toISOString();
        return profile;
    }

    deleteCpsProfile(profileId) {
        if (!Array.isArray(this.state.cpsProfiles)) return false;
        const index = this.state.cpsProfiles.findIndex(p => p.id === profileId);
        if (index === -1) return false;

        this.state.cpsProfiles.splice(index, 1);
        if (this.state.activeProfileId === profileId) {
            this.state.activeProfileId = this.state.cpsProfiles.length > 0 ? this.state.cpsProfiles[0].id : null;
        }
        return true;
    }

    switchActiveCpsProfile(profileId) {
        const exists = this.state.cpsProfiles?.some(p => p.id === profileId);
        if (exists) {
            this.state.activeProfileId = profileId;
            this.saveState();
            this.renderCps();
            this.updateUI();
            return true;
        }
        return false;
    }

    getActiveCpsProfile() {
        if (!this.state.activeProfileId || !Array.isArray(this.state.cpsProfiles)) return null;
        return this.state.cpsProfiles.find(p => p.id === this.state.activeProfileId) || null;
    }

    calculateProfileRating(profile) {
        const base = 1000;
        const taskScore = (this.state.totalTasksCompleted || 0) * 25;
        const streakScore = (this.state.streak || 0) * 50 + (this.state.longestStreak || 0) * 25;
        const levelScore = (this.state.level || 1) * 40;
        const focusScore = Math.floor((this.state.stats?.playtimeSeconds || 0) / 1500) * 30;
        return base + taskScore + streakScore + levelScore + focusScore;
    }

    calculateCpsRating() {
        return this.calculateProfileRating(this.getActiveCpsProfile());
    }

    getCpsTier(rating) {
        if (rating >= 2800) return { tier: 'Grandmaster', badge: '👑', color: '#ff0055', next: null, target: 2800, base: 2800 };
        if (rating >= 2400) return { tier: 'Master', badge: '💎', color: '#b967ff', next: 'Grandmaster', target: 2800, base: 2400 };
        if (rating >= 2000) return { tier: 'Diamond', badge: '⚡', color: '#00f0ff', next: 'Master', target: 2400, base: 2000 };
        if (rating >= 1600) return { tier: 'Platinum', badge: '🌟', color: '#00ff9f', next: 'Diamond', target: 2000, base: 1600 };
        if (rating >= 1300) return { tier: 'Gold', badge: '🏆', color: '#ffb800', next: 'Platinum', target: 1600, base: 1300 };
        if (rating >= 1100) return { tier: 'Silver', badge: '🛡️', color: '#e0e0e0', next: 'Gold', target: 1300, base: 1100 };
        return { tier: 'Bronze', badge: '🥉', color: '#cd7f32', next: 'Silver', target: 1100, base: 1000 };
    }

    getLocalLeaderboard(sortBy = 'rating') {
        if (!Array.isArray(this.state.cpsProfiles)) return [];
        const profiles = [...this.state.cpsProfiles];

        profiles.sort((a, b) => {
            if (sortBy === 'tasks') {
                const scoreA = this.state.totalTasksCompleted || 0;
                const scoreB = this.state.totalTasksCompleted || 0;
                if (scoreB !== scoreA) return scoreB - scoreA;
            } else if (sortBy === 'streak') {
                const scoreA = this.state.longestStreak || 0;
                const scoreB = this.state.longestStreak || 0;
                if (scoreB !== scoreA) return scoreB - scoreA;
            } else if (sortBy === 'level') {
                const scoreA = this.state.level || 1;
                const scoreB = this.state.level || 1;
                if (scoreB !== scoreA) return scoreB - scoreA;
            } else {
                const ratingA = this.calculateProfileRating(a);
                const ratingB = this.calculateProfileRating(b);
                if (ratingB !== ratingA) return ratingB - ratingA;
            }
            // Deterministic tie-breaker: creation time ascending
            return new Date(a.createdAt) - new Date(b.createdAt);
        });

        return profiles.map((p, idx) => ({
            rank: idx + 1,
            profile: p,
            rating: this.calculateProfileRating(p),
            isCurrentActive: p.id === this.state.activeProfileId
        }));
    }

    switchCpsSubTab(subTabName) {
        this.activeCpsSubTab = subTabName;
        if (this.dom.cpsSubnavBtns) {
            this.dom.cpsSubnavBtns.forEach(btn => {
                const match = btn.getAttribute('data-cps-sub') === subTabName;
                btn.classList.toggle('active', match);
            });
        }
        if (this.dom.cpsSubviews) {
            this.dom.cpsSubviews.forEach(view => {
                const match = view.id === `cps-sub-${subTabName}`;
                view.classList.toggle('active', match);
                view.classList.toggle('hidden', !match);
            });
        }
        const activeProfile = this.getActiveCpsProfile();
        if (subTabName === 'overview') this.renderCpsOverview(activeProfile);
        else if (subTabName === 'stats') this.renderCpsStats(activeProfile);
        else if (subTabName === 'leaderboard') this.renderCpsLeaderboard();
        else if (subTabName === 'challenges') this.renderCpsChallenges();
    }

    renderCps() {
        if (!this.dom.cpsEmptyView || !this.dom.cpsActiveView) return;

        // Empty state when no competitive profile exists
        if (!this.state.cpsProfiles || this.state.cpsProfiles.length === 0) {
            this.dom.cpsEmptyView.classList.remove('hidden');
            this.dom.cpsActiveView.classList.add('hidden');
            return;
        }

        // Active state with profiles
        this.dom.cpsEmptyView.classList.add('hidden');
        this.dom.cpsActiveView.classList.remove('hidden');

        // Populate Profile Switcher Dropdown
        if (this.dom.cpsProfileSelect) {
            this.dom.cpsProfileSelect.innerHTML = '';
            this.state.cpsProfiles.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = `${p.displayName} (@${p.username})`;
                if (p.id === this.state.activeProfileId) {
                    opt.selected = true;
                }
                this.dom.cpsProfileSelect.appendChild(opt);
            });
        }

        const activeProfile = this.getActiveCpsProfile();
        this.switchCpsSubTab(this.activeCpsSubTab || 'overview');
    }

    renderCpsOverview(profile) {
        if (!profile) return;
        const rating = this.calculateProfileRating(profile);
        const tier = this.getCpsTier(rating);

        if (this.dom.cpsAvatarDisplay) this.dom.cpsAvatarDisplay.textContent = profile.avatar || '🤖';
        if (this.dom.cpsNameDisplay) this.dom.cpsNameDisplay.textContent = profile.displayName;
        if (this.dom.cpsUsernameDisplay) this.dom.cpsUsernameDisplay.textContent = `@${profile.username}`;
        if (this.dom.cpsTitleDisplay) this.dom.cpsTitleDisplay.textContent = `${tier.tier} Developer`;
        if (this.dom.cpsSpecialtyDisplay) this.dom.cpsSpecialtyDisplay.textContent = profile.specialty || 'Full-Stack Developer';
        if (this.dom.cpsRatingDisplay) this.dom.cpsRatingDisplay.textContent = rating;
        if (this.dom.cpsCurrentTierName) this.dom.cpsCurrentTierName.textContent = tier.tier;
        if (this.dom.cpsTierEmblem) this.dom.cpsTierEmblem.textContent = tier.badge;
        if (this.dom.cpsNextTierName) {
            this.dom.cpsNextTierName.textContent = tier.next ? `${tier.next} (${tier.target})` : 'MAX TIER';
        }

        if (this.dom.cpsTierProgressBar) {
            if (tier.next) {
                const range = tier.target - (tier.base || 1000);
                const current = Math.max(0, rating - (tier.base || 1000));
                const pct = Math.min(100, Math.floor((current / range) * 100));
                this.dom.cpsTierProgressBar.style.width = `${pct}%`;
            } else {
                this.dom.cpsTierProgressBar.style.width = '100%';
            }
        }

        if (this.dom.cpsBioDisplay) {
            this.dom.cpsBioDisplay.textContent = profile.bio || 'Coding alongside my floating desktop companion.';
        }

        if (this.dom.cpsGithubLink) {
            this.dom.cpsGithubLink.textContent = profile.github ? `🔗 GitHub: @${profile.github}` : '🔗 GitHub: Not linked';
        }
        if (this.dom.cpsLeetcodeLink) {
            this.dom.cpsLeetcodeLink.textContent = profile.leetcode ? `🏆 LeetCode: @${profile.leetcode}` : '🏆 LeetCode: Not linked';
        }
        if (this.dom.cpsCodeforcesLink) {
            this.dom.cpsCodeforcesLink.textContent = profile.codeforces ? `⚡ Codeforces: @${profile.codeforces}` : '⚡ Codeforces: Not linked';
        }
        if (this.dom.cpsUidDisplay) {
            this.dom.cpsUidDisplay.textContent = profile.id;
        }
    }

    renderCpsStats(profile) {
        if (!profile) return;
        const rating = this.calculateProfileRating(profile);

        // Lifetime Totals
        if (this.dom.cpsStatTasks) this.dom.cpsStatTasks.textContent = this.state.totalTasksCompleted;
        if (this.dom.cpsStatTotalXp) {
            const totalXp = (this.state.level - 1) * this.xpPerLevel + this.state.currentXp;
            this.dom.cpsStatTotalXp.textContent = totalXp;
        }
        if (this.dom.cpsStatTotalCoins) this.dom.cpsStatTotalCoins.textContent = this.state.coins;
        if (this.dom.cpsStatFocusHrs) {
            const hrs = ((this.state.stats?.playtimeSeconds || 0) / 3600).toFixed(1);
            this.dom.cpsStatFocusHrs.textContent = `${hrs}h`;
        }

        // Current State
        if (this.dom.cpsStatCurrStreak) this.dom.cpsStatCurrStreak.textContent = `${this.state.streak}d`;
        if (this.dom.cpsStatLevel) this.dom.cpsStatLevel.textContent = this.state.level;
        if (this.dom.cpsStatHappiness) this.dom.cpsStatHappiness.textContent = `${Math.floor(this.state.currentHappiness)}%`;
        if (this.dom.cpsStatRatingCalc) this.dom.cpsStatRatingCalc.textContent = rating;

        // Records & Milestones
        if (this.dom.cpsStatBestStreak) this.dom.cpsStatBestStreak.textContent = `${this.state.longestStreak} Days`;
        if (this.dom.cpsStatAchCount) {
            const totalAch = this.getAchievementsList().length;
            this.dom.cpsStatAchCount.textContent = `${this.state.unlockedAchievements.length} / ${totalAch}`;
        }
        if (this.dom.cpsStatFirstTask) {
            this.dom.cpsStatFirstTask.textContent = this.state.totalTasksCompleted > 0 ? '✓ UNLOCKED' : 'IN PROGRESS';
        }
    }

    renderCpsLeaderboard() {
        if (!this.dom.leaderboardList) return;
        this.dom.leaderboardList.innerHTML = '';

        const ranked = this.getLocalLeaderboard(this.cpsLeaderboardSort || 'rating');
        if (ranked.length === 0) {
            this.dom.leaderboardList.innerHTML = '<div class="stat-subtext" style="text-align: center; padding: 1.5rem;">No local profiles available to rank.</div>';
            return;
        }

        ranked.forEach(item => {
            const card = document.createElement('div');
            card.className = `leaderboard-item panel ${item.isCurrentActive ? 'active-profile' : ''}`;

            let rankBadge = `#${item.rank}`;
            if (item.rank === 1) rankBadge = '🥇 #1';
            else if (item.rank === 2) rankBadge = '🥈 #2';
            else if (item.rank === 3) rankBadge = '🥉 #3';

            let metricLabel = `${item.rating} PTS`;
            if (this.cpsLeaderboardSort === 'tasks') metricLabel = `${this.state.totalTasksCompleted} Tasks`;
            else if (this.cpsLeaderboardSort === 'streak') metricLabel = `${this.state.longestStreak}d Streak`;
            else if (this.cpsLeaderboardSort === 'level') metricLabel = `Lvl ${this.state.level}`;

            card.innerHTML = `
                <div class="lb-rank">${rankBadge}</div>
                <div class="lb-avatar">${item.profile.avatar || '🤖'}</div>
                <div class="lb-meta">
                    <strong>${this.escapeHtml(item.profile.displayName)}</strong>
                    <span class="lb-handle">@${this.escapeHtml(item.profile.username)}</span>
                </div>
                <div class="lb-score text-accent">${metricLabel}</div>
                ${item.isCurrentActive ? '<span class="active-profile-pill">YOU (ACTIVE)</span>' : `<button class="toggle-btn btn-switch-profile" data-profile-id="${item.profile.id}">SWITCH</button>`}
            `;

            if (!item.isCurrentActive) {
                const switchBtn = card.querySelector('.btn-switch-profile');
                if (switchBtn) {
                    switchBtn.addEventListener('click', () => {
                        audio.play('click');
                        this.switchActiveCpsProfile(item.profile.id);
                        this.showToast('info', `Switched active profile to ${item.profile.displayName}! 👤`);
                    });
                }
            }

            this.dom.leaderboardList.appendChild(card);
        });
    }

    renderCpsChallenges() {
        if (!this.dom.competitiveChallengesList) return;
        this.dom.competitiveChallengesList.innerHTML = '';

        const sprintChallenges = [
            {
                id: 'chal-sprint-10',
                title: 'Sprint: 10 Verified Tasks',
                objective: 'Complete 10 real coding tasks without streak interruption',
                target: 10,
                progress: Math.min(10, this.state.totalTasksCompleted),
                rewardCoins: 50,
                rewardXp: 100
            },
            {
                id: 'chal-streak-3',
                title: 'Consistency: 3-Day Focus Streak',
                objective: 'Maintain an unbroken daily task streak of 3 consecutive days',
                target: 3,
                progress: Math.min(3, this.state.longestStreak),
                rewardCoins: 75,
                rewardXp: 150
            },
            {
                id: 'chal-mastery-5',
                title: 'Evolution: Reach Level 5',
                objective: 'Train your companion through focus and completed tasks to Level 5',
                target: 5,
                progress: Math.min(5, this.state.level),
                rewardCoins: 100,
                rewardXp: 200
            }
        ];

        // Track completed challenges in state to prevent duplicate claims
        if (!Array.isArray(this.state.completedChallenges)) {
            this.state.completedChallenges = [];
        }

        sprintChallenges.forEach(ch => {
            const isCompleted = ch.progress >= ch.target;
            const isClaimed = this.state.completedChallenges.includes(ch.id);
            const pct = Math.min(100, Math.floor((ch.progress / ch.target) * 100));

            const card = document.createElement('div');
            card.className = `challenge-item ${isCompleted ? 'completed' : ''}`;
            card.innerHTML = `
                <div class="chal-title">
                    <span>${this.escapeHtml(ch.title)}</span>
                    <span class="text-accent">${ch.progress}/${ch.target}</span>
                </div>
                <p class="stat-subtext" style="margin: 4px 0;">${this.escapeHtml(ch.objective)}</p>
                <div class="chal-prog"><div class="chal-prog-fill" style="width: ${pct}%"></div></div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                    <span class="stat-subtext">Reward: +${ch.rewardCoins}🪙 +${ch.rewardXp}XP</span>
                    ${isClaimed 
                        ? '<span class="text-success font-bold">✓ CLAIMED</span>' 
                        : (isCompleted 
                            ? `<button class="toggle-btn text-accent btn-claim-challenge" data-chal-id="${ch.id}">CLAIM REWARD</button>` 
                            : '<span class="stat-subtext">In Progress</span>')}
                </div>
            `;

            if (isCompleted && !isClaimed) {
                const claimBtn = card.querySelector('.btn-claim-challenge');
                if (claimBtn) {
                    claimBtn.addEventListener('click', () => {
                        this.claimChallengeReward(ch);
                    });
                }
            }

            this.dom.competitiveChallengesList.appendChild(card);
        });
    }

    claimChallengeReward(ch) {
        if (!ch || !ch.id) return;
        if (!Array.isArray(this.state.completedChallenges)) {
            this.state.completedChallenges = [];
        }
        if (this.state.completedChallenges.includes(ch.id)) {
            this.showToast('info', 'Reward already claimed!');
            return;
        }

        this.state.completedChallenges.push(ch.id);
        this.state.coins += ch.rewardCoins;
        this.state.currentXp += ch.rewardXp;
        audio.play('level');
        this.showToast('success', `Challenge Claimed: +${ch.rewardCoins}🪙 +${ch.rewardXp}XP! 🏆`);

        if (this.state.currentXp >= this.xpPerLevel) {
            this.levelUp();
        }

        this.saveState();
        this.updateUI();
        this.renderCpsChallenges();
    }

    openCpsModal(profileToEdit = null) {
        if (!this.dom.cpsModalOverlay) return;

        // Reset errors
        if (this.dom.cpsNameError) this.dom.cpsNameError.classList.add('hidden');
        if (this.dom.cpsUsernameError) this.dom.cpsUsernameError.classList.add('hidden');

        if (profileToEdit) {
            this.editingProfileId = profileToEdit.id;
            if (this.dom.cpsModalHeading) this.dom.cpsModalHeading.textContent = 'EDIT COMPETITIVE PROFILE';
            if (this.dom.cpsNameInput) this.dom.cpsNameInput.value = profileToEdit.displayName || '';
            if (this.dom.cpsUsernameInput) this.dom.cpsUsernameInput.value = profileToEdit.username || '';
            if (this.dom.cpsSpecialtyInput) this.dom.cpsSpecialtyInput.value = profileToEdit.specialty || 'Full-Stack Developer';
            if (this.dom.cpsBioInput) this.dom.cpsBioInput.value = profileToEdit.bio || '';
            if (this.dom.cpsGithubInput) this.dom.cpsGithubInput.value = profileToEdit.github || '';
            if (this.dom.cpsLeetcodeInput) this.dom.cpsLeetcodeInput.value = profileToEdit.leetcode || '';
            if (this.dom.cpsCodeforcesInput) this.dom.cpsCodeforcesInput.value = profileToEdit.codeforces || '';
            this.selectedCpsAvatar = profileToEdit.avatar || '🤖';
        } else {
            this.editingProfileId = null;
            if (this.dom.cpsModalHeading) this.dom.cpsModalHeading.textContent = 'CREATE COMPETITIVE PROFILE';
            if (this.dom.cpsNameInput) this.dom.cpsNameInput.value = '';
            if (this.dom.cpsUsernameInput) this.dom.cpsUsernameInput.value = '';
            if (this.dom.cpsSpecialtyInput) this.dom.cpsSpecialtyInput.value = 'Full-Stack Developer';
            if (this.dom.cpsBioInput) this.dom.cpsBioInput.value = '';
            if (this.dom.cpsGithubInput) this.dom.cpsGithubInput.value = '';
            if (this.dom.cpsLeetcodeInput) this.dom.cpsLeetcodeInput.value = '';
            if (this.dom.cpsCodeforcesInput) this.dom.cpsCodeforcesInput.value = '';
            this.selectedCpsAvatar = '🤖';
        }

        // Highlight selected avatar
        if (this.dom.avatarOptBtns) {
            this.dom.avatarOptBtns.forEach(btn => {
                const isSelected = btn.getAttribute('data-avatar') === this.selectedCpsAvatar;
                btn.classList.toggle('active', isSelected);
            });
        }

        this.dom.cpsModalOverlay.classList.remove('hidden');
        if (this.dom.cpsNameInput) this.dom.cpsNameInput.focus();
    }

    closeCpsModal() {
        if (this.dom.cpsModalOverlay) {
            this.dom.cpsModalOverlay.classList.add('hidden');
        }
        this.editingProfileId = null;
    }

    saveCpsForm() {
        const displayName = (this.dom.cpsNameInput.value || '').trim();
        const rawUsername = (this.dom.cpsUsernameInput.value || '').trim();

        let hasError = false;

        if (!displayName || displayName.length > 30) {
            if (this.dom.cpsNameError) this.dom.cpsNameError.classList.remove('hidden');
            hasError = true;
        } else {
            if (this.dom.cpsNameError) this.dom.cpsNameError.classList.add('hidden');
        }

        let validatedUsername = null;
        try {
            validatedUsername = this.validateUsername(rawUsername, this.editingProfileId);
            if (this.dom.cpsUsernameError) this.dom.cpsUsernameError.classList.add('hidden');
        } catch (err) {
            if (this.dom.cpsUsernameError) {
                this.dom.cpsUsernameError.textContent = err.message;
                this.dom.cpsUsernameError.classList.remove('hidden');
            }
            hasError = true;
        }

        if (hasError) {
            audio.play('error');
            return;
        }

        const avatar = this.selectedCpsAvatar || '🤖';
        const specialty = this.dom.cpsSpecialtyInput.value || 'Full-Stack Developer';
        const bio = (this.dom.cpsBioInput.value || '').trim().slice(0, 160);
        const github = (this.dom.cpsGithubInput.value || '').trim();
        const leetcode = (this.dom.cpsLeetcodeInput.value || '').trim();
        const codeforces = (this.dom.cpsCodeforcesInput.value || '').trim();

        if (this.editingProfileId) {
            this.editCpsProfile(this.editingProfileId, {
                displayName,
                username: validatedUsername,
                avatar,
                specialty,
                bio,
                github,
                leetcode,
                codeforces
            });
            this.showToast('success', 'Competitive profile updated! 🏆');
        } else {
            this.createCpsProfile({
                displayName,
                username: validatedUsername,
                avatar,
                specialty,
                bio,
                github,
                leetcode,
                codeforces
            });
            this.showToast('success', `Competitive profile @${validatedUsername} created! 🌟`);
        }

        audio.play('click');
        this.saveState();
        this.renderCps();
        this.updateUI();
        this.closeCpsModal();
    }

    openDeleteCpsModal(profileId) {
        this.deletingProfileId = profileId;
        if (this.dom.cpsDeleteModalOverlay) {
            this.dom.cpsDeleteModalOverlay.classList.remove('hidden');
        }
    }

    closeDeleteCpsModal() {
        this.deletingProfileId = null;
        if (this.dom.cpsDeleteModalOverlay) {
            this.dom.cpsDeleteModalOverlay.classList.add('hidden');
        }
    }

    confirmDeleteCps() {
        if (!this.deletingProfileId) return;
        const success = this.deleteCpsProfile(this.deletingProfileId);
        if (success) {
            this.showToast('info', 'Profile deleted.');
            this.saveState();
            this.renderCps();
            this.updateUI();
        }
        this.closeDeleteCpsModal();
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

    // --- Shop & Inventory (Unified Catalog, Previews & Equip Toggles) ---
    getShopItems() {
        return [
            { 
                id: 'bg-space', 
                name: 'Space BG', 
                cost: 100, 
                type: 'bg', 
                thumbClass: 'thumb-space', 
                previewIcon: '🌌', 
                desc: 'Deep cosmic nebula with parallax stars' 
            },
            { 
                id: 'bg-forest', 
                name: 'Forest BG', 
                cost: 100, 
                type: 'bg', 
                thumbClass: 'thumb-forest', 
                previewIcon: '🌲', 
                desc: 'Neon cyber-emerald grid and atmosphere' 
            },
            { 
                id: 'acc-hat2', 
                name: 'Top Hat', 
                cost: 150, 
                type: 'hat', 
                previewIcon: '🎩', 
                desc: 'Aristocratic cyberpunk topper' 
            },
            { 
                id: 'acc-shades2', 
                name: 'Neon Shades', 
                cost: 150, 
                type: 'glasses', 
                previewIcon: '🕶️', 
                desc: 'Laser-pink cyber visors' 
            }
        ];
    }

    renderShop() {
        if (this.dom.shopCoinsDisplay) {
            this.dom.shopCoinsDisplay.textContent = this.state.coins;
        }
        if (!this.dom.shopGrid) return;
        this.dom.shopGrid.innerHTML = '';

        this.getShopItems().forEach(item => {
            const isOwned = this.state.shopUnlocked.includes(item.id);
            const isEquipped = this.state.equippedAccessories[item.type] === item.id;
            const el = document.createElement('div');
            el.className = `shop-item rarity-epic`;

            const thumbHtml = item.thumbClass 
                ? `<div class="shop-thumbnail ${item.thumbClass}">${item.previewIcon || ''}</div>`
                : `<div class="inv-icon">${item.previewIcon || '🛒'}</div>`;

            let actionBtnHtml = '';
            if (!isOwned) {
                actionBtnHtml = `<button class="toggle-btn text-warning" aria-label="Buy ${item.name}">${item.cost} 🪙 BUY</button>`;
            } else if (isEquipped) {
                actionBtnHtml = `<button class="toggle-btn equipped" aria-label="Unequip ${item.name}">UNEQUIP</button>`;
            } else {
                actionBtnHtml = `<button class="toggle-btn text-accent" aria-label="Equip ${item.name}">EQUIP</button>`;
            }

            el.innerHTML = `
                ${thumbHtml}
                <div class="inv-details">
                    <span class="inv-name">${item.name}</span>
                    <span class="shop-cost">${isOwned ? (isEquipped ? '<span class="badge-equipped">EQUIPPED</span>' : 'OWNED') : item.cost + ' 🪙'}</span>
                </div>
                ${actionBtnHtml}
            `;

            const btn = el.querySelector('button');
            if (!isOwned) {
                btn.addEventListener('click', () => this.buyItem(item));
            } else {
                btn.addEventListener('click', () => {
                    audio.play('click');
                    if (isEquipped) {
                        this.state.equippedAccessories[item.type] = false;
                        this.showToast('info', `Unequipped ${item.name}.`);
                    } else {
                        this.state.equippedAccessories[item.type] = item.id;
                        this.showToast('success', `Equipped ${item.name}! ✨`);
                    }
                    this.applyEquippedBackground();
                    this.saveState();
                    this.renderShop();
                    this.renderInventory();
                    this.updateAccessoriesUI();
                });
            }
            this.dom.shopGrid.appendChild(el);
        });
        this.renderInventory();
    }

    buyItem(item) {
        if (!item || !item.id) return;

        // Prevent duplicate purchases
        if (this.state.shopUnlocked.includes(item.id)) {
            this.showToast('info', `You already own ${item.name}!`);
            audio.play('click');
            return;
        }

        if (this.state.coins >= item.cost) {
            this.state.coins -= item.cost;
            this.state.shopUnlocked.push(item.id);
            // Auto equip on buy
            if (item.type) {
                this.state.equippedAccessories[item.type] = item.id;
            }
            audio.play('coin');
            this.showToast('success', `Bought and equipped ${item.name}! 🛒`);
            this.applyEquippedBackground();
            this.saveState();
            this.renderShop();
            this.renderInventory();
            this.updateAccessoriesUI();
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
                items.push({ 
                    id: si.id, 
                    name: si.name, 
                    req: 1, 
                    icon: si.previewIcon || '✨', 
                    type: si.type, 
                    thumbClass: si.thumbClass 
                });
            }
        });

        items.forEach(item => {
            const isUnlocked = this.state.level >= item.req || this.state.shopUnlocked.includes(item.id);
            const isEquipped = this.state.equippedAccessories[item.type] === item.id;
            const el = document.createElement('div');
            el.className = `inv-slot rarity-common ${isUnlocked ? '' : 'locked'}`;

            const iconHtml = item.thumbClass
                ? `<div class="shop-thumbnail ${item.thumbClass}" style="margin: 0 auto 0.4rem;">${item.icon}</div>`
                : `<div class="inv-icon">${item.icon}</div>`;

            el.innerHTML = `
                ${iconHtml}
                <div class="inv-details">
                    <span class="inv-name">${item.name}</span>
                    <span class="inv-status">${isUnlocked ? (isEquipped ? 'EQUIPPED' : 'Owned') : 'Lvl ' + item.req}</span>
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
                        this.showToast('info', `Unequipped ${item.name}.`);
                    } else {
                        this.state.equippedAccessories[item.type] = item.id;
                        this.showToast('success', `Equipped ${item.name}! ✨`);
                    }
                    this.applyEquippedBackground();
                    this.saveState();
                    this.renderShop();
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
        this.saveState();
    }

    renderCollectibles() {
        if (!this.dom.colGrid) return;
        this.dom.colGrid.innerHTML = '';
        if (this.state.collectibles.length === 0) {
            this.dom.colGrid.innerHTML = '<span class="stat-subtext">No collectibles yet... Complete coding tasks!</span>';
            return;
        }
        this.state.collectibles.forEach(col => {
            const el = document.createElement('div');
            el.className = `col-item rarity-${col.rarity}`;
            el.innerHTML = `
                <div class="inv-icon">📦</div>
                <div class="inv-details">
                    <span class="inv-name">${col.name}</span>
                    <span class="inv-status">${col.rarity.toUpperCase()}</span>
                </div>
            `;
            this.dom.colGrid.appendChild(el);
        });
    }

    // --- Dialogue & Interactive Events ---
    showDialogue(customText = null) {
        if (!this.dom.dialogueBubble || this.isSleeping) return;
        const quotes = [
            "Remember to commit often!",
            "Did you test that edge case?",
            "Drink some water, dev! 💧",
            "Beep boop! Ready to code!",
            "Your streak is looking hot 🔥",
            "Refactoring is self-care.",
            "Syntax error? No problem!",
            "One more task!"
        ];
        const text = customText || quotes[Math.floor(Math.random() * quotes.length)];
        this.dom.dialogueBubble.textContent = text;
        this.dom.dialogueBubble.classList.remove('hidden');
        clearTimeout(this.dialogueTimeout);
        this.dialogueTimeout = setTimeout(() => {
            this.dom.dialogueBubble.classList.add('hidden');
        }, 4000);
    }

    triggerRandomEvent() {
        if (!this.dom.eventContainer || this.isSleeping) return;
        const events = [
            { name: "Bug Catch! 🐛", reward: 15, msg: "Caught a bug! +15🪙" },
            { name: "Coffee Boost! ☕", reward: 10, msg: "Caffeine surge! +10🪙" },
            { name: "Lucky Gem! 💎", reward: 50, msg: "Found a lucky gem! +50🪙" }
        ];
        const ev = events[Math.floor(Math.random() * events.length)];
        this.dom.eventContainer.textContent = ev.name;
        this.dom.eventContainer.classList.remove('hidden');
        this.tempPetMood('curious', 3000);

        const onClick = () => {
            this.state.coins += ev.reward;
            this.showToast('success', ev.msg);
            audio.play('coin');
            this.dom.eventContainer.classList.add('hidden');
            this.dom.eventContainer.removeEventListener('click', onClick);
            this.updateUI();
            this.saveState();
        };

        this.dom.eventContainer.addEventListener('click', onClick);
        clearTimeout(this.eventTimeout);
        this.eventTimeout = setTimeout(() => {
            this.dom.eventContainer.classList.add('hidden');
            this.dom.eventContainer.removeEventListener('click', onClick);
        }, 10000);
    }

    // --- Challenges ---
    generateChallenges() {
        if (this.state.challenges && this.state.challenges.length > 0) {
            this.renderChallenges();
            return;
        }
        this.state.challenges = [
            { id: 'c1', desc: 'Complete 10 tasks', type: 'tasks', target: 10, progress: 0, reward: 50, done: false },
            { id: 'c2', desc: 'Reach Level 5', type: 'levels', target: 5, progress: this.state.level, reward: 100, done: false }
        ];
        this.renderChallenges();
    }

    updateChallengeProgress(type, amt) {
        if (!this.state.challenges) return;
        let changed = false;
        this.state.challenges.forEach(c => {
            if (c.type === type && !c.done) {
                if (type === 'levels') {
                    c.progress = this.state.level;
                } else {
                    c.progress += amt;
                }
                if (c.progress >= c.target) {
                    c.done = true;
                    c.progress = c.target;
                    this.state.coins += c.reward;
                    this.showToast('success', `Challenge Done: ${c.desc}! +${c.reward}🪙`);
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

    // --- Achievements ---
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

    // --- Save & Theme Management ---
    applyTheme() {
        document.body.setAttribute('data-theme', this.state.theme);
        if (this.dom.themeSwitcher) {
            this.dom.themeSwitcher.value = this.state.theme;
        }
        if (this.dom.btnMute) {
            this.dom.btnMute.textContent = this.state.audioMuted ? '🔇' : '🔊';
        }
        this.canvasAccentColor = getComputedStyle(document.body).getPropertyValue('--color-accent').trim() || '#00F0FF';
        this.applyEquippedBackground();
    }

    exportSave() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.state, null, 2));
        const anchor = document.createElement('a');
        anchor.setAttribute("href", dataStr);
        anchor.setAttribute("download", `devpet_save_${new Date().toISOString().split('T')[0]}.json`);
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
                this.mergeState(parsed);
                this.saveState();
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
            if (this.dom.shopCoinsDisplay) this.dom.shopCoinsDisplay.textContent = this.state.coins;
        } else {
            this.animateValue(this.dom.xpText, prevObj.oldXp || 0, this.state.currentXp, 400);
            this.animateValue(this.dom.totalTasksDisplay, prevObj.oldTasks || 0, this.state.totalTasksCompleted, 300);
            this.animateValue(this.dom.coinsDisplay, prevObj.oldCoins || 0, this.state.coins, 500);
            if (this.dom.shopCoinsDisplay) this.dom.shopCoinsDisplay.textContent = this.state.coins;
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
