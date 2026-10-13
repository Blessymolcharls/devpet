// floating.js - Companion Logic for Floating Desktop Window

let gameState = {
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
    theme: 'cyberpunk',
    cps: {
        handle: 'DevCoder#404',
        title: 'Code Apprentice',
        rating: 1040
    }
};

let pomo = {
    active: false,
    timeRem: 25 * 60,
    interval: null
};

// --- DOM Elements ---
const dom = {
    root: document.getElementById('floating-pet-root'),
    btnOpenDash: document.getElementById('btn-open-dash'),
    btnMinimizePet: document.getElementById('btn-minimize-pet'),
    btnCloseApp: document.getElementById('btn-close-app'),
    btnQuickTask: document.getElementById('btn-quick-task'),
    btnQuickPomo: document.getElementById('btn-quick-pomo'),
    btnPetInteract: document.getElementById('btn-pet-interact'),
    fwLevel: document.getElementById('fw-level'),
    fwXp: document.getElementById('fw-xp'),
    fwCoins: document.getElementById('fw-coins'),
    fwCpsBadge: document.getElementById('fw-cps-tier-badge'),
    fwCpsRating: document.getElementById('fw-cps-rating'),
    fwPomoTime: document.getElementById('fw-pomo-time'),
    floatingBubble: document.getElementById('floating-bubble'),
    floatingEvent: document.getElementById('floating-event'),
    petWrapper: document.getElementById('pet-container'),
    sleepIndicator: document.getElementById('sleep-indicator'),
    accHat: document.getElementById('acc-hat'),
    accHat2: document.getElementById('acc-hat2'),
    accGlasses: document.getElementById('acc-glasses'),
    accShades2: document.getElementById('acc-shades2'),
    accCrown: document.getElementById('acc-crown')
};

// --- CPS Calculation ---
function calculateCpsRating(state) {
    const base = 1000;
    const taskScore = (state.totalTasksCompleted || 0) * 25;
    const streakScore = (state.streak || 0) * 50 + (state.longestStreak || 0) * 25;
    const levelScore = (state.level || 1) * 40;
    const focusScore = Math.floor((state.stats?.playtimeSeconds || 0) / 1500) * 30;
    return base + taskScore + streakScore + levelScore + focusScore;
}

function getCpsTier(rating) {
    if (rating >= 2800) return { tier: 'Grandmaster', badge: '👑', color: '#ff0055' };
    if (rating >= 2400) return { tier: 'Master', badge: '💎', color: '#b967ff' };
    if (rating >= 2000) return { tier: 'Diamond', badge: '⚡', color: '#00f0ff' };
    if (rating >= 1600) return { tier: 'Platinum', badge: '🌟', color: '#00ff9f' };
    if (rating >= 1300) return { tier: 'Gold', badge: '🏆', color: '#ffb800' };
    if (rating >= 1100) return { tier: 'Silver', badge: '🛡️', color: '#e0e0e0' };
    return { tier: 'Bronze', badge: '🥉', color: '#cd7f32' };
}

// --- Click-Through Window Management ---
function setupClickThrough() {
    if (!window.devPetDesktop) return;

    // Window margin is transparent; hover on card is interactive
    dom.root.addEventListener('mouseenter', () => {
        window.devPetDesktop.setIgnoreMouseEvents(false);
    });

    dom.root.addEventListener('mouseleave', () => {
        window.devPetDesktop.setIgnoreMouseEvents(true, { forward: true });
    });
}

// --- Sync & Render UI ---
function renderUI() {
    if (dom.fwLevel) dom.fwLevel.textContent = gameState.level;
    if (dom.fwXp) dom.fwXp.textContent = `${gameState.currentXp}/100`;
    if (dom.fwCoins) dom.fwCoins.textContent = gameState.coins;

    let activeProfile = null;
    if (Array.isArray(gameState.cpsProfiles) && gameState.activeProfileId) {
        activeProfile = gameState.cpsProfiles.find(p => p.id === gameState.activeProfileId);
    }
    const rating = calculateCpsRating(gameState);
    const tier = getCpsTier(rating);
    if (dom.fwCpsRating) dom.fwCpsRating.textContent = rating;
    if (dom.fwCpsBadge) {
        dom.fwCpsBadge.textContent = activeProfile?.avatar || tier.badge;
        dom.fwCpsBadge.style.color = tier.color;
        if (activeProfile) {
            dom.fwCpsBadge.title = `${activeProfile.displayName} (@${activeProfile.username}) - ${tier.tier}`;
        }
    }

    // Accessories
    const eq = gameState.equippedAccessories || {};
    if (dom.accHat) dom.accHat.classList.toggle('hidden', eq.hat !== 'acc-hat');
    if (dom.accHat2) dom.accHat2.classList.toggle('hidden', eq.hat !== 'acc-hat2');
    if (dom.accGlasses) dom.accGlasses.classList.toggle('hidden', eq.glasses !== 'acc-glasses');
    if (dom.accShades2) dom.accShades2.classList.toggle('hidden', eq.glasses !== 'acc-shades2');
    if (dom.accCrown) dom.accCrown.classList.toggle('hidden', eq.crown !== 'acc-crown');

    // Sleep state
    const isSleeping = gameState.currentHappiness <= 10;
    if (dom.sleepIndicator) dom.sleepIndicator.classList.toggle('hidden', !isSleeping);
}

// --- Dialogue Bubble ---
let bubbleTimeout = null;
function showBubble(text, duration = 3000) {
    if (!dom.floatingBubble) return;
    dom.floatingBubble.textContent = text;
    dom.floatingBubble.classList.remove('hidden');
    if (bubbleTimeout) clearTimeout(bubbleTimeout);
    bubbleTimeout = setTimeout(() => {
        dom.floatingBubble.classList.add('hidden');
    }, duration);
}

// --- Task Completion in Floating Pet ---
function handleQuickTask() {
    const todayStr = new Date().toISOString().split('T')[0];

    // Check if there is an uncompleted task in task list
    let targetTask = null;
    if (Array.isArray(gameState.tasks)) {
        targetTask = gameState.tasks.find(t => !t.completed);
    }

    if (targetTask) {
        targetTask.completed = true;
        targetTask.completedAt = new Date().toISOString();
        if (!targetTask.rewardClaimed) {
            targetTask.rewardClaimed = true;
            awardTaskRewards(todayStr);
            showBubble(`Done: "${targetTask.title}"! 🎉`);
        }
    } else {
        // Quick general task
        awardTaskRewards(todayStr);
        showBubble("+20 XP  +Coins logged! ✨");
    }

    saveAndBroadcastState();
    renderUI();
}

function awardTaskRewards(todayStr) {
    if (gameState.lastTaskDate !== todayStr) {
        if (!gameState.lastTaskDate) {
            gameState.streak = 1;
        } else {
            const lastDate = new Date(gameState.lastTaskDate + 'T00:00:00');
            const todayDate = new Date(todayStr + 'T00:00:00');
            const diffDays = Math.round((todayDate - lastDate) / 86400000);
            if (diffDays === 1) {
                gameState.streak += 1;
            } else {
                gameState.streak = 1;
            }
        }
        gameState.lastTaskDate = todayStr;
        gameState.longestStreak = Math.max(gameState.longestStreak, gameState.streak);
    }

    gameState.totalTasksCompleted = (gameState.totalTasksCompleted || 0) + 1;
    gameState.currentHappiness = Math.min(100, (gameState.currentHappiness || 100) + 10);

    const xpGained = 20;
    const coinsGained = 5 + Math.floor(gameState.streak / 2);

    gameState.currentXp += xpGained;
    gameState.coins = (gameState.coins || 0) + coinsGained;

    if (gameState.currentXp >= 100) {
        gameState.level += 1;
        gameState.currentXp -= 100;
        showBubble(`LEVEL UP! Now Level ${gameState.level}! 🚀`, 4000);
    }
}

// --- Save & Sync ---
async function saveAndBroadcastState() {
    if (window.devPetDesktop) {
        await window.devPetDesktop.saveState(gameState);
    }
    try {
        localStorage.setItem('codebuddy_pet_state', JSON.stringify(gameState));
    } catch (e) {}
}

// --- Random Event Spawner ---
function spawnRandomEvent() {
    const events = [
        { name: 'Bug Catch! 🐛', coins: 15 },
        { name: 'Coffee Boost! ☕', coins: 10 },
        { name: 'Lucky Gem! 💎', coins: 50 }
    ];
    const ev = events[Math.floor(Math.random() * events.length)];
    if (!dom.floatingEvent) return;

    dom.floatingEvent.textContent = ev.name;
    dom.floatingEvent.classList.remove('hidden');

    const onClick = () => {
        gameState.coins = (gameState.coins || 0) + ev.coins;
        showBubble(`+${ev.coins} Coins! 🪙`);
        dom.floatingEvent.classList.add('hidden');
        dom.floatingEvent.removeEventListener('click', onClick);
        saveAndBroadcastState();
        renderUI();
    };

    dom.floatingEvent.addEventListener('click', onClick);

    setTimeout(() => {
        dom.floatingEvent.classList.add('hidden');
        dom.floatingEvent.removeEventListener('click', onClick);
    }, 12000);
}

// --- Pomodoro Mini Timer ---
function togglePomodoro() {
    if (pomo.active) {
        clearInterval(pomo.interval);
        pomo.active = false;
        pomo.timeRem = 25 * 60;
        updatePomoDisplay();
        showBubble("Timer stopped.");
    } else {
        pomo.active = true;
        pomo.interval = setInterval(() => {
            if (pomo.timeRem > 0) {
                pomo.timeRem -= 1;
                updatePomoDisplay();
            } else {
                clearInterval(pomo.interval);
                pomo.active = false;
                pomo.timeRem = 25 * 60;
                updatePomoDisplay();
                // Reward focus session
                gameState.currentXp += 50;
                gameState.coins += 25;
                gameState.currentHappiness = Math.min(100, gameState.currentHappiness + 25);
                if (gameState.currentXp >= 100) {
                    gameState.level += 1;
                    gameState.currentXp -= 100;
                }
                showBubble("Focus session complete! +50 XP +25 Coins! 🍅🎉", 4000);
                saveAndBroadcastState();
                renderUI();
            }
        }, 1000);
        showBubble("Focus timer started! 💻");
    }
}

function updatePomoDisplay() {
    const m = Math.floor(pomo.timeRem / 60);
    const s = pomo.timeRem % 60;
    if (dom.fwPomoTime) {
        dom.fwPomoTime.textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
    }
}

// --- Initialize Floating Companion ---
async function initFloatingCompanion() {
    setupClickThrough();

    // Load initial state
    if (window.devPetDesktop) {
        const desktopState = await window.devPetDesktop.getInitialState();
        if (desktopState) {
            gameState = { ...gameState, ...desktopState };
        } else {
            const saved = localStorage.getItem('codebuddy_pet_state');
            if (saved) {
                try { gameState = { ...gameState, ...JSON.parse(saved) }; } catch(e) {}
            }
        }

        // Listen for updates from dashboard window
        window.devPetDesktop.onStateUpdated((newState) => {
            if (newState && typeof newState === 'object') {
                gameState = { ...gameState, ...newState };
                renderUI();
            }
        });
    } else {
        const saved = localStorage.getItem('codebuddy_pet_state');
        if (saved) {
            try { gameState = { ...gameState, ...JSON.parse(saved) }; } catch(e) {}
        }
    }

    renderUI();

    // Event Bindings
    if (dom.btnOpenDash) {
        dom.btnOpenDash.addEventListener('click', () => {
            if (window.devPetDesktop) window.devPetDesktop.openDashboard();
        });
    }

    if (dom.btnMinimizePet) {
        dom.btnMinimizePet.addEventListener('click', () => {
            if (window.devPetDesktop) window.devPetDesktop.hidePet();
        });
    }

    if (dom.btnCloseApp) {
        dom.btnCloseApp.addEventListener('click', () => {
            if (window.devPetDesktop) window.devPetDesktop.quitApp();
        });
    }

    if (dom.btnQuickTask) {
        dom.btnQuickTask.addEventListener('click', handleQuickTask);
    }

    if (dom.btnQuickPomo) {
        dom.btnQuickPomo.addEventListener('click', togglePomodoro);
    }

    if (dom.btnPetInteract) {
        dom.btnPetInteract.addEventListener('click', () => {
            gameState.currentHappiness = Math.min(100, gameState.currentHappiness + 5);
            const quotes = [
                "Beep boop! You're awesome!",
                "Code looks great today!",
                "Remember to drink water! 💧",
                "Crushing bugs together! 🚀",
                "Keep that daily streak alive! 🔥"
            ];
            const q = quotes[Math.floor(Math.random() * quotes.length)];
            showBubble(q);
            saveAndBroadcastState();
            renderUI();
        });
    }

    // Periodic random events (every 2-3 minutes)
    setInterval(() => {
        if (Math.random() < 0.6) {
            spawnRandomEvent();
        }
    }, 120000);
}

document.addEventListener('DOMContentLoaded', initFloatingCompanion);
