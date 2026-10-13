// main.js - Electron Desktop Overlay & State Controller for DevPet 2.0
const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

let floatingWindow = null;
let dashboardWindow = null;
let tray = null;

const STATE_FILE = path.join(app.getPath('userData'), 'devpet_state.json');
const POSITION_FILE = path.join(app.getPath('userData'), 'pet_position.json');

// --- State Persistence & Synchronization ---
function loadPersistedState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            const raw = fs.readFileSync(STATE_FILE, 'utf-8');
            const data = JSON.parse(raw);
            if (data && typeof data === 'object') {
                return data;
            }
        }
    } catch (err) {
        console.error('[DevPet] Failed to read state from disk:', err);
    }
    return null;
}

function savePersistedState(state) {
    try {
        if (state && typeof state === 'object') {
            fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
            broadcastState(state);
            return true;
        }
    } catch (err) {
        console.error('[DevPet] Failed to write state to disk:', err);
    }
    return false;
}

function broadcastState(state, senderWebContents = null) {
    [floatingWindow, dashboardWindow].forEach((win) => {
        if (win && !win.isDestroyed() && win.webContents !== senderWebContents) {
            win.webContents.send('state-updated', state);
        }
    });
}

// --- Position Persistence & Screen Boundary Clamping ---
function loadSavedPosition(width = 280, height = 300) {
    const primary = screen.getPrimaryDisplay();
    const workArea = primary.workArea;
    const defaultX = workArea.x + workArea.width - width - 40;
    const defaultY = workArea.y + workArea.height - height - 40;

    try {
        if (fs.existsSync(POSITION_FILE)) {
            const raw = fs.readFileSync(POSITION_FILE, 'utf-8');
            const pos = JSON.parse(raw);
            if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
                return clampToWorkArea(pos.x, pos.y, width, height);
            }
        }
    } catch (err) {
        console.error('[DevPet] Failed to read pet position:', err);
    }

    return { x: defaultX, y: defaultY };
}

function clampToWorkArea(x, y, width, height) {
    const matchingDisplay = screen.getDisplayMatching({ x, y, width, height }) || screen.getPrimaryDisplay();
    const work = matchingDisplay.workArea;

    const clampedX = Math.max(work.x, Math.min(x, work.x + work.width - width));
    const clampedY = Math.max(work.y, Math.min(y, work.y + work.height - height));

    return { x: Math.round(clampedX), y: Math.round(clampedY) };
}

function savePosition(x, y, width = 280, height = 300) {
    try {
        const clamped = clampToWorkArea(x, y, width, height);
        fs.writeFileSync(POSITION_FILE, JSON.stringify(clamped), 'utf-8');
    } catch (err) {
        console.error('[DevPet] Failed to save pet position:', err);
    }
}

// --- Window Creation ---
function createFloatingWindow() {
    if (floatingWindow && !floatingWindow.isDestroyed()) {
        floatingWindow.show();
        floatingWindow.focus();
        return;
    }

    const width = 280;
    const height = 320;
    const pos = loadSavedPosition(width, height);

    floatingWindow = new BrowserWindow({
        width,
        height,
        x: pos.x,
        y: pos.y,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        resizable: false,
        skipTaskbar: false,
        hasShadow: false,
        backgroundColor: '#00000000',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            backgroundThrottling: false
        }
    });

    floatingWindow.setAlwaysOnTop(true, 'screen-saver');
    floatingWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    floatingWindow.loadFile(path.join(__dirname, 'floating.html'));

    let moveTimeout = null;
    floatingWindow.on('moved', () => {
        if (moveTimeout) clearTimeout(moveTimeout);
        moveTimeout = setTimeout(() => {
            if (floatingWindow && !floatingWindow.isDestroyed()) {
                const [x, y] = floatingWindow.getPosition();
                savePosition(x, y, width, height);
            }
        }, 300);
    });

    floatingWindow.on('closed', () => {
        floatingWindow = null;
    });
}

function createOrFocusDashboardWindow() {
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
        if (dashboardWindow.isMinimized()) dashboardWindow.restore();
        dashboardWindow.show();
        dashboardWindow.focus();
        return;
    }

    dashboardWindow = new BrowserWindow({
        width: 1200,
        height: 820,
        minWidth: 800,
        minHeight: 600,
        title: 'DevPet (CodeBuddy) Dashboard',
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    dashboardWindow.loadFile(path.join(__dirname, 'index.html'));

    dashboardWindow.on('closed', () => {
        dashboardWindow = null;
    });
}

// --- System Tray ---
function setupTray() {
    try {
        // Generate crisp 16x16 icon programmatically if icon file not present
        const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
            <rect width="16" height="16" rx="3" fill="#00f0ff"/>
            <rect x="3" y="5" width="10" height="7" fill="#0b0d13"/>
            <rect x="5" y="7" width="2" height="2" fill="#00ff9f"/>
            <rect x="9" y="7" width="2" height="2" fill="#00ff9f"/>
        </svg>`;
        const icon = nativeImage.createFromBuffer(Buffer.from(iconSvg));

        tray = new Tray(icon);
        const contextMenu = Menu.buildFromTemplate([
            { label: 'DevPet 2.0 Desktop Companion', enabled: false },
            { type: 'separator' },
            {
                label: 'Show Floating Pet',
                click: () => {
                    if (!floatingWindow || floatingWindow.isDestroyed()) {
                        createFloatingWindow();
                    } else {
                        floatingWindow.show();
                        floatingWindow.setAlwaysOnTop(true, 'screen-saver');
                    }
                }
            },
            {
                label: 'Hide Floating Pet',
                click: () => {
                    if (floatingWindow && !floatingWindow.isDestroyed()) {
                        floatingWindow.hide();
                    }
                }
            },
            {
                label: 'Open Dashboard',
                click: () => createOrFocusDashboardWindow()
            },
            {
                label: 'Reset Pet Position',
                click: () => {
                    if (floatingWindow && !floatingWindow.isDestroyed()) {
                        const primary = screen.getPrimaryDisplay();
                        const work = primary.workArea;
                        const x = work.x + work.width - 320;
                        const y = work.y + work.height - 350;
                        floatingWindow.setPosition(x, y);
                        savePosition(x, y);
                    }
                }
            },
            { type: 'separator' },
            {
                label: 'Quit DevPet',
                click: () => app.quit()
            }
        ]);

        tray.setToolTip('DevPet (CodeBuddy) Desktop Companion');
        tray.setContextMenu(contextMenu);
        tray.on('double-click', () => {
            if (floatingWindow && !floatingWindow.isDestroyed()) {
                floatingWindow.show();
            } else {
                createFloatingWindow();
            }
        });
    } catch (err) {
        console.error('[DevPet] Tray creation skipped:', err);
    }
}

// --- IPC Channel Handlers ---
function setupIPC() {
    ipcMain.handle('get-initial-state', () => {
        return loadPersistedState();
    });

    ipcMain.handle('save-state', (event, state) => {
        if (!state || typeof state !== 'object') {
            return { success: false, error: 'Invalid state object' };
        }
        const ok = savePersistedState(state);
        // Broadcast to other window
        broadcastState(state, event.sender);
        return { success: ok };
    });

    ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
        if (floatingWindow && !floatingWindow.isDestroyed() && event.sender === floatingWindow.webContents) {
            floatingWindow.setIgnoreMouseEvents(Boolean(ignore), options || { forward: true });
        }
    });

    ipcMain.on('open-dashboard', () => {
        createOrFocusDashboardWindow();
    });

    ipcMain.on('close-dashboard', () => {
        if (dashboardWindow && !dashboardWindow.isDestroyed()) {
            dashboardWindow.close();
        }
    });

    ipcMain.on('hide-pet', () => {
        if (floatingWindow && !floatingWindow.isDestroyed()) {
            floatingWindow.hide();
        }
    });

    ipcMain.on('show-pet', () => {
        if (floatingWindow && !floatingWindow.isDestroyed()) {
            floatingWindow.show();
        } else {
            createFloatingWindow();
        }
    });

    ipcMain.on('quit-app', () => {
        app.quit();
    });

    ipcMain.handle('get-pet-position', () => {
        return loadSavedPosition();
    });

    ipcMain.handle('save-pet-position', (event, { x, y }) => {
        if (typeof x === 'number' && typeof y === 'number') {
            savePosition(x, y);
            return true;
        }
        return false;
    });
}

// --- App Lifecycle ---
app.whenReady().then(() => {
    setupIPC();
    setupTray();
    createFloatingWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createFloatingWindow();
        }
    });
});

app.on('window-all-closed', () => {
    // Keep app alive in tray if on Windows, unless explicitly quit
    if (process.platform !== 'win32') {
        app.quit();
    }
});
