# DevPet 2.0 (CodeBuddy)

> A retro-cyberpunk gamified virtual pet desktop companion, coin economy, task system, and Competitive Profile System (CPS) for developers.

DevPet 2.0 transforms your coding routines into an engaging cyberpunk RPG companion. It floats directly above your desktop—overlaying VS Code, browsers, and terminal windows—with seamless dragging, transparent click-through protection, coin shop economy, full-featured task management, and Competitive Profiles.

---

## 🚀 What's New in DevPet 2.0

### 1. 🪟 Genuine Desktop Floating Pet Companion
- **Always-on-Top Frameless Overlay**: Transparent, borderless window hovering above all active applications (VS Code, Chrome, terminals).
- **Click-Through Transparency**: Mouse clicks pass through transparent regions to underlying windows, while capturing clicks when hovering over the companion and its action buttons.
- **Persistent Desktop Positioning**: Draggable around the desktop with automatic monitor work-area clamping and position memory between restarts.
- **Compact Floating Controls**: Quick access to Dashboard (`[📊]`), Hide to Tray (`[➖]`), Exit (`[✕]`), Quick Task logging (`[+ TASK]`), Pomodoro timer toggle (`[🍅]`), and pet interactions (`[❤️]`).
- **System Tray Integration**: Background tray menu to show/hide pet, restore position, open dashboard, or cleanly exit.
- **Dual-Mode Compatibility**: Runs as a lightweight native Electron overlay or directly in the browser with fallback widgets.

### 2. 🪙 Fixed & Unified Coin & Background Economy
- **Live Coin Balance Header**: Prominently displayed in both dashboard and shop views.
- **Visual Background & Accessory Previews**: Mini color gradients and icon previews for every catalog item.
- **Re-Purchase Prevention**: Strict validation preventing duplicate purchases and erroneous coin deductions for already-owned items.
- **Direct Equip / Unequip in Shop**: Owned backgrounds and accessories can be equipped or unequipped without re-spending coins.
- **Active Background Rendering**: Immediate application of equipped parallax themes (`Space BG` and `Forest BG`) across views.
- **Zero-Loss Data Migration**: Automatically migrates legacy saves without wiping coin balance, achievements, or collectibles.

### 3. 📋 Comprehensive Task System
- **Structured Creation Form**:
  - Task title (with inline validation rejecting empty/whitespace inputs).
  - Optional description.
  - Priority levels (`Low`, `Medium`, `High`).
  - Due date & time support with overdue warning indicators.
  - Categories (`Feature`, `Bugfix`, `Refactor`, `Docs`, `Learning`, `General`).
  - Estimated duration (minutes).
- **Task Management**:
  - Filter by `All`, `Active`, `Completed`, or `High Priority`.
  - Sort by `Newest First`, `Oldest First`, `Priority`, or `Due Date`.
  - Reversible completion checkbox with strike-through styling.
  - Edit existing tasks via modal dialog.
  - Delete tasks with safe confirmation modal.
  - Cyberpunk empty state for zero-task views.
- **Reward Idempotency**:
  - Each task awards XP and coins exactly once. Re-opening or editing a completed task prevents infinite reward exploits.

### 4. 🏆 Competitive Profile System (CPS)
- **Competitive Developer Tier & Rating**:
  - Calculated based on verified coding achievements, daily streaks, Pomodoro sessions, and companion level.
  - Tiers: `Bronze` (1000+), `Silver` (1100+), `Gold` (1300+), `Platinum` (1600+), `Diamond` (2000+), `Master` (2400+), `Grandmaster` (2800+).
- **Customizable Developer Card**:
  - Developer handle / callsign (e.g., `DevCoder#404`).
  - Specialty / Role selection (Full-Stack, Backend, Frontend, Systems, DevOps, AI/ML).
  - Developer bio and philosophy.
  - Linked competitive platform handles (GitHub, LeetCode, Codeforces).
  - Real-time rating progress bar toward the next tier.
  - Live CPS badge and rating shown on the floating desktop companion.

---

## 🛠️ Technology Stack & Architecture

| Component | Technology | Role |
|---|---|---|
| **Desktop Wrapper** | Electron 44+ | Frameless transparent overlay, IPC state coordinator, System Tray |
| **Preload Security** | Electron `contextBridge` | Isolated IPC bridge with Node.js integration disabled in renderer |
| **Companion Renderer** | HTML5 / CSS3 / Vanilla JS | Dedicated floating companion window with click-through control |
| **Dashboard UI** | HTML5 / CSS3 / Vanilla JS | Full retro-cyberpunk control center and tabs |
| **Audio Engine** | Web Audio API | Zero-dependency 8-bit oscillator synthesis |
| **Persistence** | File Storage + `localStorage` | Dual-sync storage in `userData/devpet_state.json` & browser storage |
| **Test Suite** | Native `node:test` | Automated unit tests covering all core mechanics and state logic |

---

## 📁 Project Structure

```
devpet/
├── main.js           # Electron main process: transparent overlay, tray, IPC & state sync
├── preload.js        # Secure contextBridge API for renderer windows
├── floating.html     # Dedicated floating desktop companion window markup
├── floating.css      # Floating companion styling, animations, and drag layout
├── floating.js       # Floating pet logic, mini timer, and click-through handler
├── index.html        # Main dashboard DOM: Tasks, Shop, Inv, CPS, Pomodoro, Themes
├── style.css         # Cyberpunk design system, modals, task cards, and responsive rules
├── script.js         # Core companion state engine, task management, shop, and CPS
├── package.json      # Dependencies, start scripts, and metadata
├── tests/
│   └── app.test.js   # Automated unit tests for economy, tasks, streak, CPS, and pomo
└── README.md         # Documentation and guide
```

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js** (v18 or higher recommended)
- **npm** (v9 or higher)

### 2. Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/Blessymolcharls/devpet.git
cd devpet
npm install
```

### 3. Launching DevPet 2.0 Desktop Companion
Launch the native desktop floating pet overlay and dashboard:
```bash
npm start
```

### 4. Running in Web Browser Mode (Preview Only)
To run as a browser preview without the native desktop overlay:
```bash
npx serve .
# or
python -m http.server 8080
```
Open `http://localhost:8080` or double-click `index.html`.

> [!NOTE]
> True desktop always-on-top companion overlay (floating over VS Code, Chrome, etc.) and native Windows title-bar controls (Minimize to taskbar, Maximize to desktop work area, Restore Down, Close) require running DevPet via Electron (`npm start`). Web browsers cannot provide native always-on-top window layering or taskbar minimization due to browser security sandbox constraints.

---

## 🧪 Running Automated Tests

Run the native Node.js test suite:
```bash
npm test
```

The test suite validates:
- Initial state integrity and boundary constraints
- Task completion XP, coin, and happiness calculations
- Streak tracking across calendar days and rollover resets
- Shop verification and duplicate purchase prevention
- Equipping owned backgrounds without duplicate coin deductions
- Task creation validation, editing, deletion, and empty states
- Reward idempotency upon unchecking and re-checking tasks
- CPS rating calculation and tier transitions
- Pomodoro timer completion and reset behavior

---

## 🎮 Two-State Mutually Exclusive Interface Architecture

DevPet operates in two clean, mutually exclusive modes without overlapping windows:

1. **Mode A — Full Dashboard:**
   - Starts automatically on `npm start`.
   - Comprehensive productivity suite: Level, XP, happiness, coins, streak, Pomodoro focus timer, task manager, shop, inventory, and CPS leaderboard.
   - Includes standard Windows window controls: Minimize (`—`), Maximize (`□`) / Restore Down (`❐`), and Close (`✕`).
   - Click **`FLOAT PET`** in the top navigation to switch cleanly into Mode B (the dashboard hides and the floating companion appears).

2. **Mode B — Floating Companion:**
   - Single, compact, transparent, frameless, always-on-top desktop widget (`screen-saver` level).
   - Click-through transparency on non-interactive regions, responsive micro-animations, quick tasks, and Pomodoro timer.
   - Standard controls: Zoom/Restore (`🔍`), Minimize (`➖`), and Dismiss (`✕`).
   - Click **`⤢` (Return to Dashboard)** or the pet name to switch cleanly back to Mode A (the companion hides and the dashboard is restored).

| Action | Control / Shortcut |
|---|---|
| **Float Pet (Enter Mode B)** | Click `[ FLOAT PET ]` in the Dashboard top navigation |
| **Return to Dashboard (Mode A)** | Click `[ ⤢ ]` or click pet name on the Floating Companion |
| **Drag Pet** | Click and drag the top title bar of the floating pet |
| **Zoom Companion** | Click `[ 🔍 ]` to toggle compact (230x250) vs zoomed (320x350) |
| **Minimize Companion** | Click `[ ➖ ]` to minimize companion to the system tray |
| **Dismiss Companion** | Click `[ ✕ ]` to return safely to Full Dashboard |
| **Quick Task** | Click `[ + TASK ]` on the companion to log progress |
| **Toggle Focus Timer**| Click `[ 🍅 25:00 ]` on the companion |
| **Pet Companion** | Click `[ ❤️ ]` or click directly on the pet |

---

## 📄 License

MIT License. Free for developer personal and commercial use.
