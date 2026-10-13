// tests/app.test.js - Automated Unit Tests for DevPet 2.0 Game Logic & CPS
const test = require('node:test');
const assert = require('node:assert/strict');

// Minimal Game Logic Model mirroring script.js
class DevPetGameLogic {
    constructor() {
        this.xpPerLevel = 100;
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
            challenges: [
                { id: 'c1', desc: 'Complete 10 tasks', type: 'tasks', target: 10, progress: 0, reward: 50, done: false },
                { id: 'c2', desc: 'Reach Level 5', type: 'levels', target: 5, progress: 1, reward: 100, done: false }
            ],
            cpsProfiles: [],
            activeProfileId: null
        };
        this.pomo = { active: false, timeRem: 25 * 60, selectedMin: 25 };
    }

    checkDailyStreak(simulatedTodayStr) {
        if (!this.state.lastTaskDate) return;
        if (this.state.lastTaskDate === simulatedTodayStr) return;

        const lastDate = new Date(this.state.lastTaskDate + 'T00:00:00');
        const todayDate = new Date(simulatedTodayStr + 'T00:00:00');
        const diffDays = Math.round((todayDate - lastDate) / 86400000);

        if (diffDays > 1) {
            this.state.streak = 0;
        }
    }

    completeTask(simulatedTodayStr = new Date().toISOString().split('T')[0]) {
        if (this.state.lastTaskDate !== simulatedTodayStr) {
            if (!this.state.lastTaskDate) {
                this.state.streak = 1;
            } else {
                const lastDate = new Date(this.state.lastTaskDate + 'T00:00:00');
                const todayDate = new Date(simulatedTodayStr + 'T00:00:00');
                const diffDays = Math.round((todayDate - lastDate) / 86400000);
                if (diffDays === 1) {
                    this.state.streak += 1;
                } else {
                    this.state.streak = 1;
                }
            }
            this.state.lastTaskDate = simulatedTodayStr;
            this.state.longestStreak = Math.max(this.state.longestStreak, this.state.streak);
        }

        this.state.totalTasksCompleted += 1;
        this.state.currentHappiness = Math.min(100, this.state.currentHappiness + 10);
        const xpGained = 20;
        const coinsGained = 5 + Math.floor(this.state.streak / 2);
        this.state.currentXp += xpGained;
        this.state.coins += coinsGained;

        if (this.state.currentXp >= this.xpPerLevel) {
            this.levelUp();
        }

        this.checkAchievements();
    }

    levelUp() {
        this.state.level += 1;
        this.state.currentXp -= this.xpPerLevel;
    }

    checkAchievements() {
        const thresholds = { 1: "First Code", 5: "Code Monkey", 10: "Script Kiddie", 25: "Stack Overflow Sr.", 50: "Linus Mode" };
        for (const [target, name] of Object.entries(thresholds)) {
            const num = parseInt(target, 10);
            const achId = `ach-${num}`;
            if (this.state.totalTasksCompleted >= num && !this.state.unlockedAchievements.includes(achId)) {
                this.state.unlockedAchievements.push(achId);
            }
        }
    }

    buyItem(item) {
        if (!item || !item.id || typeof item.cost !== 'number') return false;
        // Prevent duplicate purchases
        if (this.state.shopUnlocked.includes(item.id)) {
            return false;
        }
        if (this.state.coins >= item.cost) {
            this.state.coins -= item.cost;
            this.state.shopUnlocked.push(item.id);
            return true;
        }
        return false;
    }

    equipItem(type, itemId) {
        if (itemId && !this.state.shopUnlocked.includes(itemId)) {
            return false;
        }
        if (!this.state.equippedAccessories) {
            this.state.equippedAccessories = { hat: false, glasses: false, crown: false, bg: null };
        }
        this.state.equippedAccessories[type] = itemId || false;
        return true;
    }

    createTask(data) {
        const title = (data?.title || '').trim();
        if (!title) {
            throw new Error('Task title cannot be empty');
        }
        const task = {
            id: data.id || `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            title,
            description: (data.description || '').trim(),
            priority: ['low', 'medium', 'high'].includes(data.priority) ? data.priority : 'medium',
            dueDate: data.dueDate || null,
            category: data.category ? data.category.trim() : 'General',
            estimatedMinutes: parseInt(data.estimatedMinutes, 10) > 0 ? parseInt(data.estimatedMinutes, 10) : null,
            completed: false,
            completedAt: null,
            rewardClaimed: false,
            createdAt: new Date().toISOString()
        };
        if (!Array.isArray(this.state.tasks)) {
            this.state.tasks = [];
        }
        this.state.tasks.unshift(task);
        return task;
    }

    completeSpecificTask(taskId, simulatedTodayStr = new Date().toISOString().split('T')[0]) {
        const task = this.state.tasks?.find(t => t.id === taskId);
        if (!task) return null;
        if (!task.completed) {
            task.completed = true;
            task.completedAt = new Date().toISOString();
            if (!task.rewardClaimed) {
                task.rewardClaimed = true;
                this.completeTask(simulatedTodayStr);
            }
        }
        return task;
    }

    uncompleteSpecificTask(taskId) {
        const task = this.state.tasks?.find(t => t.id === taskId);
        if (!task) return null;
        if (task.completed) {
            task.completed = false;
            task.completedAt = null;
        }
        return task;
    }

    editTask(taskId, updates) {
        const task = this.state.tasks?.find(t => t.id === taskId);
        if (!task) return null;
        if (updates.title !== undefined) {
            const trimmed = updates.title.trim();
            if (!trimmed) throw new Error('Task title cannot be empty');
            task.title = trimmed;
        }
        if (updates.description !== undefined) task.description = updates.description.trim();
        if (updates.priority !== undefined && ['low', 'medium', 'high'].includes(updates.priority)) {
            task.priority = updates.priority;
        }
        if (updates.dueDate !== undefined) task.dueDate = updates.dueDate;
        if (updates.category !== undefined) task.category = updates.category.trim();
        if (updates.estimatedMinutes !== undefined) {
            const mins = parseInt(updates.estimatedMinutes, 10);
            task.estimatedMinutes = mins > 0 ? mins : null;
        }
        return task;
    }

    deleteTask(taskId) {
        if (!Array.isArray(this.state.tasks)) return false;
        const idx = this.state.tasks.findIndex(t => t.id === taskId);
        if (idx !== -1) {
            this.state.tasks.splice(idx, 1);
            return true;
        }
        return false;
    }

    // --- CPS (Competitive Profiles System) Logic ---
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

    getCpsTier(rating) {
        if (rating >= 2800) return { tier: 'Grandmaster', badge: '👑', color: '#ff0055' };
        if (rating >= 2400) return { tier: 'Master', badge: '💎', color: '#b967ff' };
        if (rating >= 2000) return { tier: 'Diamond', badge: '⚡', color: '#00f0ff' };
        if (rating >= 1600) return { tier: 'Platinum', badge: '🌟', color: '#00ff9f' };
        if (rating >= 1300) return { tier: 'Gold', badge: '🏆', color: '#ffb800' };
        if (rating >= 1100) return { tier: 'Silver', badge: '🛡️', color: '#e0e0e0' };
        return { tier: 'Bronze', badge: '🥉', color: '#cd7f32' };
    }

    getLocalLeaderboard(sortBy = 'rating') {
        if (!Array.isArray(this.state.cpsProfiles)) return [];
        const profiles = [...this.state.cpsProfiles];

        profiles.sort((a, b) => {
            const ratingA = this.calculateProfileRating(a);
            const ratingB = this.calculateProfileRating(b);
            if (ratingB !== ratingA) return ratingB - ratingA;
            // Consistent tie-breaker: by creation time
            return new Date(a.createdAt) - new Date(b.createdAt);
        });

        return profiles.map((p, idx) => ({
            rank: idx + 1,
            profile: p,
            rating: this.calculateProfileRating(p),
            isCurrentActive: p.id === this.state.activeProfileId
        }));
    }

    migrateLegacyCps(legacyCpsObj) {
        if (!Array.isArray(this.state.cpsProfiles)) {
            this.state.cpsProfiles = [];
        }
        if (legacyCpsObj && typeof legacyCpsObj === 'object' && this.state.cpsProfiles.length === 0) {
            const sanitizedUser = (legacyCpsObj.handle || 'devcoder').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 20);
            const profile = {
                id: 'prof_migrated_legacy',
                username: sanitizedUser.length >= 3 ? sanitizedUser : 'devcoder',
                displayName: legacyCpsObj.handle || 'DevCoder',
                avatar: '🤖',
                bio: legacyCpsObj.bio || 'Coding with my desktop companion.',
                specialty: legacyCpsObj.specialty || 'Full-Stack Developer',
                github: legacyCpsObj.github || '',
                leetcode: legacyCpsObj.leetcode || '',
                codeforces: legacyCpsObj.codeforces || '',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            this.state.cpsProfiles.push(profile);
            this.state.activeProfileId = profile.id;
            return profile;
        }
        return null;
    }

    completePomo() {
        this.pomo.active = false;
        this.pomo.timeRem = this.pomo.selectedMin * 60; // reset
        this.state.currentXp += 50;
        this.state.coins += 25;
        this.state.currentHappiness = Math.min(100, this.state.currentHappiness + 25);
        if (this.state.currentXp >= this.xpPerLevel) {
            this.levelUp();
        }
    }
}

// === EXISTING SUITE TESTS (ALL PRESERVED) ===
test('Initial state integrity and boundaries', () => {
    const game = new DevPetGameLogic();
    assert.equal(game.state.level, 1);
    assert.equal(game.state.currentXp, 0);
    assert.equal(game.state.currentHappiness, 100);
    assert.equal(game.state.coins, 0);
    assert.equal(game.state.streak, 0);
    assert.equal(game.state.totalTasksCompleted, 0);
    assert.deepEqual(game.state.unlockedAchievements, []);
    assert.deepEqual(game.state.cpsProfiles, []);
    assert.equal(game.state.activeProfileId, null);
});

test('Task completion awards XP, coins, happiness, and increments total tasks', () => {
    const game = new DevPetGameLogic();
    game.state.currentHappiness = 50;
    game.completeTask('2026-10-10');

    assert.equal(game.state.totalTasksCompleted, 1);
    assert.equal(game.state.currentXp, 20);
    assert.equal(game.state.coins, 5); // 5 + floor(1/2) = 5
    assert.equal(game.state.currentHappiness, 60);
    assert.equal(game.state.streak, 1);
    assert.equal(game.state.longestStreak, 1);
});

test('Multiple tasks on the same day do not inflate daily streak', () => {
    const game = new DevPetGameLogic();
    game.completeTask('2026-10-10');
    game.completeTask('2026-10-10');
    game.completeTask('2026-10-10');

    assert.equal(game.state.totalTasksCompleted, 3);
    assert.equal(game.state.streak, 1);
    assert.equal(game.state.longestStreak, 1);
    assert.equal(game.state.currentXp, 60);
});

test('Consecutive day task completion properly increments daily streak', () => {
    const game = new DevPetGameLogic();
    game.completeTask('2026-10-10');
    assert.equal(game.state.streak, 1);

    game.completeTask('2026-10-11');
    assert.equal(game.state.streak, 2);
    assert.equal(game.state.longestStreak, 2);

    game.completeTask('2026-10-12');
    assert.equal(game.state.streak, 3);
    assert.equal(game.state.longestStreak, 3);
});

test('Missed calendar day breaks daily streak and resets on next task', () => {
    const game = new DevPetGameLogic();
    game.completeTask('2026-10-10');
    game.completeTask('2026-10-11');
    assert.equal(game.state.streak, 2);

    // Opening app on 2026-10-13 (missed Oct 12)
    game.checkDailyStreak('2026-10-13');
    assert.equal(game.state.streak, 0);

    // Completing task starts fresh streak
    game.completeTask('2026-10-13');
    assert.equal(game.state.streak, 1);
    assert.equal(game.state.longestStreak, 2); // Longest streak preserved
});

test('Level-up triggers when XP reaches or exceeds 100', () => {
    const game = new DevPetGameLogic();
    // 5 tasks = 5 * 20 = 100 XP
    for (let i = 0; i < 5; i++) {
        game.completeTask('2026-10-10');
    }
    assert.equal(game.state.level, 2);
    assert.equal(game.state.currentXp, 0);

    // 6th task
    game.completeTask('2026-10-10');
    assert.equal(game.state.level, 2);
    assert.equal(game.state.currentXp, 20);
});

test('Achievements unlock at exact thresholds', () => {
    const game = new DevPetGameLogic();
    assert.equal(game.state.unlockedAchievements.length, 0);

    // 1st task unlocks First Code
    game.completeTask('2026-10-10');
    assert.deepEqual(game.state.unlockedAchievements, ['ach-1']);

    // Tasks 2, 3, 4
    for (let i = 2; i <= 4; i++) {
        game.completeTask('2026-10-10');
    }
    assert.deepEqual(game.state.unlockedAchievements, ['ach-1']);

    // 5th task unlocks Code Monkey
    game.completeTask('2026-10-10');
    assert.deepEqual(game.state.unlockedAchievements, ['ach-1', 'ach-5']);
});

test('Shop purchase verifies coins and prevents duplicate deduction', () => {
    const game = new DevPetGameLogic();
    game.state.coins = 120;

    const item = { id: 'bg-space', name: 'Space BG', cost: 100 };
    const purchased = game.buyItem(item);
    assert.equal(purchased, true);
    assert.equal(game.state.coins, 20);
    assert.equal(game.state.shopUnlocked.includes('bg-space'), true);

    // Attempt duplicate purchase of already owned item -> should fail & not deduct
    const duplicateBuy = game.buyItem(item);
    assert.equal(duplicateBuy, false);
    assert.equal(game.state.coins, 20);

    // Attempt purchase without enough coins
    const secondItem = { id: 'bg-forest', name: 'Forest BG', cost: 100 };
    const failed = game.buyItem(secondItem);
    assert.equal(failed, false);
    assert.equal(game.state.coins, 20);
});

test('Equipping owned items does not spend coins or duplicate state', () => {
    const game = new DevPetGameLogic();
    game.state.coins = 200;
    const bgItem = { id: 'bg-space', name: 'Space BG', cost: 100 };
    game.buyItem(bgItem);
    assert.equal(game.state.coins, 100);

    // Equip background
    const equipped = game.equipItem('bg', 'bg-space');
    assert.equal(equipped, true);
    assert.equal(game.state.equippedAccessories.bg, 'bg-space');
    assert.equal(game.state.coins, 100); // Coins remain untouched!

    // Unequip background
    game.equipItem('bg', false);
    assert.equal(game.state.equippedAccessories.bg, false);
    assert.equal(game.state.coins, 100);

    // Cannot equip unowned item
    const unownedEquip = game.equipItem('bg', 'bg-forest');
    assert.equal(unownedEquip, false);
});

test('Task creation validates empty titles and properly stores metadata', () => {
    const game = new DevPetGameLogic();

    // Rejects empty/whitespace title
    assert.throws(() => {
        game.createTask({ title: '   ' });
    }, /cannot be empty/);

    // Creates valid task
    const task = game.createTask({
        title: 'Implement Dark Mode Bugfix',
        description: 'Fix contrast issues on settings panel',
        priority: 'high',
        category: 'Bugfix',
        dueDate: '2026-10-20',
        estimatedMinutes: 45
    });

    assert.equal(task.title, 'Implement Dark Mode Bugfix');
    assert.equal(task.priority, 'high');
    assert.equal(task.category, 'Bugfix');
    assert.equal(task.estimatedMinutes, 45);
    assert.equal(task.completed, false);
    assert.equal(task.rewardClaimed, false);
    assert.equal(game.state.tasks.length, 1);
});

test('Task completion awards rewards exactly once and prevents exploit on uncheck-recheck', () => {
    const game = new DevPetGameLogic();
    const task = game.createTask({ title: 'Refactor Synth Engine' });

    assert.equal(game.state.totalTasksCompleted, 0);
    assert.equal(game.state.coins, 0);
    assert.equal(game.state.currentXp, 0);

    // Complete task
    game.completeSpecificTask(task.id, '2026-10-10');
    assert.equal(task.completed, true);
    assert.equal(task.rewardClaimed, true);
    assert.equal(game.state.totalTasksCompleted, 1);
    assert.equal(game.state.coins, 5);
    assert.equal(game.state.currentXp, 20);

    // Uncheck / mark incomplete
    game.uncompleteSpecificTask(task.id);
    assert.equal(task.completed, false);

    // Re-check / complete again -> rewards must NOT be awarded again!
    game.completeSpecificTask(task.id, '2026-10-10');
    assert.equal(task.completed, true);
    assert.equal(game.state.totalTasksCompleted, 1); // Still 1!
    assert.equal(game.state.coins, 5); // Still 5!
    assert.equal(game.state.currentXp, 20); // Still 20!
});

test('Task editing and deletion maintain integrity', () => {
    const game = new DevPetGameLogic();
    const task = game.createTask({ title: 'Original Title', priority: 'low' });

    game.editTask(task.id, { title: 'Updated Title', priority: 'high', estimatedMinutes: 60 });
    assert.equal(task.title, 'Updated Title');
    assert.equal(task.priority, 'high');
    assert.equal(task.estimatedMinutes, 60);

    // Edit rejects blank title
    assert.throws(() => {
        game.editTask(task.id, { title: '   ' });
    }, /cannot be empty/);

    // Deletion
    const deleted = game.deleteTask(task.id);
    assert.equal(deleted, true);
    assert.equal(game.state.tasks.length, 0);
});

test('Pomodoro timer completion awards points and resets countdown timer', () => {
    const game = new DevPetGameLogic();
    game.pomo.active = true;
    game.pomo.timeRem = 0;

    game.completePomo();
    assert.equal(game.pomo.active, false);
    assert.equal(game.pomo.timeRem, 25 * 60); // Reset prevents spamming
    assert.equal(game.state.currentXp, 50);
    assert.equal(game.state.coins, 25);
});

// === NEW CPS (COMPETITIVE PROFILES SYSTEM) TESTS ===

test('CPS Profile creation validates usernames and prevents duplicate usernames', () => {
    const game = new DevPetGameLogic();

    // Rejects empty or invalid username
    assert.throws(() => {
        game.createCpsProfile({ username: 'ab', displayName: 'Too Short' });
    }, /between 3 and 20/);

    assert.throws(() => {
        game.createCpsProfile({ username: 'bad name!', displayName: 'Invalid Chars' });
    }, /alphanumeric/);

    // Creates valid first profile
    const p1 = game.createCpsProfile({
        username: 'cyber_coder',
        displayName: 'Cyber Coder',
        avatar: '🤖',
        bio: 'Competitive dev.'
    });

    assert.equal(p1.username, 'cyber_coder');
    assert.equal(p1.displayName, 'Cyber Coder');
    assert.equal(game.state.activeProfileId, p1.id);
    assert.equal(game.state.cpsProfiles.length, 1);

    // Prevents duplicate username (case-insensitive)
    assert.throws(() => {
        game.createCpsProfile({
            username: 'CYBER_CODER',
            displayName: 'Imposter'
        });
    }, /already taken/);

    // Creates valid second profile
    const p2 = game.createCpsProfile({
        username: 'speed_hacker',
        displayName: 'Speed Hacker',
        avatar: '⚡'
    });
    assert.equal(game.state.cpsProfiles.length, 2);
    assert.equal(game.state.activeProfileId, p2.id);
});

test('CPS Profile editing and switching updates state without corrupting pet data', () => {
    const game = new DevPetGameLogic();
    const p1 = game.createCpsProfile({ username: 'dev_one', displayName: 'Dev One' });
    const p2 = game.createCpsProfile({ username: 'dev_two', displayName: 'Dev Two' });

    // Switch active profile
    game.switchActiveCpsProfile(p1.id);
    assert.equal(game.getActiveCpsProfile().id, p1.id);

    // Edit profile
    game.editCpsProfile(p1.id, {
        displayName: 'Master Architect',
        avatar: '👑',
        bio: 'Coding algorithms.'
    });

    const updated = game.getActiveCpsProfile();
    assert.equal(updated.displayName, 'Master Architect');
    assert.equal(updated.avatar, '👑');

    // Attempting to change p1's username to p2's username fails
    assert.throws(() => {
        game.editCpsProfile(p1.id, { username: 'dev_two' });
    }, /already taken/);

    // Pet customization remains untouched
    assert.deepEqual(game.state.equippedAccessories, { hat: false, glasses: false, crown: false, bg: null });
});

test('CPS Profile deletion cleans up state and handles empty state properly', () => {
    const game = new DevPetGameLogic();
    const p1 = game.createCpsProfile({ username: 'solo_dev', displayName: 'Solo Dev' });
    assert.equal(game.getActiveCpsProfile() !== null, true);

    // Delete only profile -> returns to empty state
    game.deleteCpsProfile(p1.id);
    assert.equal(game.state.cpsProfiles.length, 0);
    assert.equal(game.state.activeProfileId, null);
    assert.equal(game.getActiveCpsProfile(), null);
});

test('CPS Local Leaderboard ranks profiles with consistent calculations and tie-breaking', () => {
    const game = new DevPetGameLogic();
    game.state.totalTasksCompleted = 8;
    game.state.streak = 3;
    game.state.longestStreak = 4;
    game.state.level = 2;

    const p1 = game.createCpsProfile({ username: 'alpha_coder', displayName: 'Alpha' });
    const p2 = game.createCpsProfile({ username: 'beta_coder', displayName: 'Beta' });

    const leaderboard = game.getLocalLeaderboard();
    assert.equal(leaderboard.length, 2);
    // Rank 1 and Rank 2 assigned with active marker
    assert.equal(leaderboard[0].rank, 1);
    assert.equal(leaderboard[1].rank, 2);
    // Active profile p2 is flagged
    assert.equal(leaderboard.find(e => e.profile.id === p2.id).isCurrentActive, true);
    assert.equal(leaderboard.find(e => e.profile.id === p1.id).isCurrentActive, false);
});

test('CPS Legacy migration safely imports existing cps object into cpsProfiles', () => {
    const game = new DevPetGameLogic();
    assert.equal(game.state.cpsProfiles.length, 0);

    const legacy = {
        handle: 'LegendCoder#99',
        bio: 'Legacy coder',
        specialty: 'Systems',
        github: 'legend'
    };

    const migrated = game.migrateLegacyCps(legacy);
    assert.equal(migrated !== null, true);
    assert.equal(game.state.cpsProfiles.length, 1);
    assert.equal(game.state.activeProfileId, migrated.id);
    assert.equal(migrated.displayName, 'LegendCoder#99');
    assert.equal(migrated.github, 'legend');
});
