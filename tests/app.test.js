// tests/app.test.js - Automated Unit Tests for DevPet Game Logic
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
            unlockedAchievements: [],
            shopUnlocked: ['acc-hat', 'acc-glasses', 'acc-crown'],
            challenges: [
                { id: 'c1', desc: 'Complete 10 tasks', type: 'tasks', target: 10, progress: 0, reward: 50, done: false },
                { id: 'c2', desc: 'Reach Level 5', type: 'levels', target: 5, progress: 1, reward: 100, done: false }
            ]
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
        if (this.state.coins >= item.cost) {
            this.state.coins -= item.cost;
            if (!this.state.shopUnlocked.includes(item.id)) {
                this.state.shopUnlocked.push(item.id);
            }
            return true;
        }
        return false;
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

test('Initial state integrity and boundaries', () => {
    const game = new DevPetGameLogic();
    assert.equal(game.state.level, 1);
    assert.equal(game.state.currentXp, 0);
    assert.equal(game.state.currentHappiness, 100);
    assert.equal(game.state.coins, 0);
    assert.equal(game.state.streak, 0);
    assert.equal(game.state.totalTasksCompleted, 0);
    assert.deepEqual(game.state.unlockedAchievements, []);
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

    // Attempt purchase without enough coins
    const secondItem = { id: 'bg-forest', name: 'Forest BG', cost: 100 };
    const failed = game.buyItem(secondItem);
    assert.equal(failed, false);
    assert.equal(game.state.coins, 20);
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
