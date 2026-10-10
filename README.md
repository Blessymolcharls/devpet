# DevPet (CodeBuddy)

> A retro-cyberpunk gamified virtual pet companion and focus productivity system for developers.

DevPet brings retro gaming mechanics to coding routines. It rewards completing tasks with companion evolutions, coins, collectibles, and milestone achievements, while integrating a Pomodoro focus timer and ambient audio synthesis.

---

## Verified Features

### 🐾 Virtual Companion Mechanics
- **Pixel-Art SVG Companion**: Scalable crisp-pixel companion rendered natively in SVG with dynamic eyes, mouth, and antenna.
- **Companion Evolutions**: Automatic visual scaling and evolution badges at **Level 10** (Junior), **Level 30** (Advanced), and **Level 50** (Legendary).
- **Expressive Mood System**: Responsive animations reflecting companion state:
  - `idle`: Gentle vertical floating.
  - `happy`: Excited bouncing upon task completion.
  - `excited`: 360° spin jump on level up.
  - `curious`: Tilt animation during random events.
  - `focused`: Heightened contrast glow during active Pomodoro sessions.
  - `tired`: Dimmed swaying when happiness is low.
  - `sleeping`: Lowered opacity, dimmed posture, and floating `Zzz` particles after 60 seconds of inactivity.
- **Interactive Random Events**: Clickable event spawns including **Bug Catch (+15🪙)**, **Coffee Boost (+10🪙)**, and **Lucky Gem (+50🪙)**.

### ⏱️ Developer Productivity Tools
- **Task Tracker**: Log completed coding tasks to award +20 XP, +10 Happiness, and streak-scaled coins.
- **Pomodoro Focus Timer**: 25-minute and 50-minute session presets with chiptune synthesized alerts, active countdown, and completion rewards (+50 XP, +25🪙, +25 Happiness).
- **Calendar-Based Daily Streak**: Deterministic calendar-day streak tracking that rewards daily coding consistency without double-counting on same-day refreshes.
- **Float Mode Widget**: Compact bottom-right companion widget with real-time XP and a quick `+ TASK` button designed to float next to an editor.

### 🛍️ Economy, Cosmetics & Collectibles
- **In-Game Shop**: Spend coins on cosmetics including **Top Hat** (150🪙), **Neon Shades** (150🪙), **Space Background** (100🪙), and **Forest Background** (100🪙).
- **Inventory System**: Equip and unequip owned hats, shades, crowns, and custom parallax backgrounds.
- **Collectibles Loot Drops**: 10% chance per task to discover collectible relics:
  - Common: *Golden Floppy*, *Debug Duck*
  - Rare: *Syntax Potion*
  - Epic: *RAM Stick*
  - Legendary: *Glitch Shard*

### 🏆 Achievements & Challenges
- **Milestone Achievements**:
  - `First Code` (1 task)
  - `Code Monkey` (5 tasks)
  - `Script Kiddie` (10 tasks)
  - `Stack Overflow Sr.` (25 tasks)
  - `Linus Mode` (50 tasks)
- **Weekly Challenges**: Goal progression for cumulative task completions and companion level thresholds.
- **Statistics Dashboard**: Real-time display of tasks completed, cumulative XP, companion level, happiness %, coin purse, best streak, unlocked achievements, and active session playtime.

### 🎵 Audio Synthesis & Visual Themes
- **Web Audio Synth Engine**: Zero-dependency browser oscillator synthesizer delivering authentic square, sine, and sawtooth 8-bit sound effects.
- **Theme Switcher**: Instant switching between 5 curated cyberpunk and retro palettes:
  - `Cyberpunk` (Obsidian, Cyan, Matrix Green, Amber)
  - `Dark` (Zinc, Sky Blue)
  - `Retro Green` (Terminal Monochromatic Green)
  - `Space` (Deep Navy, Magenta, Neon Cyan)
  - `Forest` (Deep Pine, Emerald Green)

---

## Technology Stack

| Layer | Technology | Details |
|---|---|---|
| **Markup** | HTML5 | Semantic elements, SVG graphics, WCAG ARIA roles |
| **Styling** | Vanilla CSS3 | Custom CSS variable tokens, glassmorphism, fluid grids |
| **Logic** | Vanilla ES6+ | Object-oriented modular state architecture |
| **Audio** | Web Audio API | Zero-asset programmatic oscillator synthesis |
| **Storage** | Browser `localStorage` | Schema-validated state persistence with JSON export/import |
| **Testing** | Node.js Test Runner | Native `node:test` and `node:assert` (zero external dependencies) |

---

## Project Structure

```
devpet/
├── index.html        # Main DOM structure, SVG companion definitions, modals, tabs
├── style.css         # Cyberpunk design system, animations, themes, responsiveness
├── script.js         # Companion state engine, loops, synth engine, event handling
├── tests/
│   └── app.test.js   # Automated unit tests for core game logic and streak math
└── README.md         # Project documentation and specifications
```

---

## Getting Started

DevPet has no build steps or package installations required to run.

### Running Locally

#### Option 1: Direct File
Open [index.html](file:///c:/Users/bless/GIT/devpet/index.html) directly in any modern browser (Chrome, Edge, Firefox, Safari).

#### Option 2: Local HTTP Server (Recommended)
Using Python:
```bash
python -m http.server 8080
```
Using Node.js:
```bash
npx serve .
```

Open your browser and navigate to `http://localhost:8080`.

---

## Controls & Keyboard Shortcuts

| Shortcut / Control | Action |
|---|---|
| `[ COMPLETE CODING TASK ]` | Complete a task (+20 XP, +10 Happiness, coins) |
| `Escape` | Dismiss the Level Up modal dialog |
| `Space` / `Enter` (on Import button) | Open JSON save file picker via keyboard |
| `Tab` / `Shift + Tab` | Navigate interactive controls with high-contrast `:focus-visible` ring |
| `FLOAT MODE` / `EXPAND` | Toggle compact floating widget mode |

---

## Running Automated Tests

DevPet includes an automated unit test suite verifying state initialization, task calculations, streak calendar rollovers, Pomodoro resets, level-ups, and achievement unlock boundaries.

Run tests using Node.js:
```bash
node --test tests/app.test.js
```

---

## Accessibility & Responsiveness

- **Keyboard Navigation**: High-contrast `:focus-visible` indicators across all buttons, tabs, and file inputs.
- **Screen Reader Readiness**: Progress bars expose live `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax="100"`. Dialogs declare `role="dialog"` and `aria-modal="true"`.
- **Motion Safety**: Full `@media (prefers-reduced-motion: reduce)` support to suppress non-essential parallax and pet animations.
- **Responsive Layout**: Fluid CSS Grid and Flexbox layouts designed for desktop (>1200px), tablet (768px - 1200px), and mobile viewports (<768px).

---

## License

MIT License. Free for developer personal and commercial use.
