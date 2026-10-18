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

// --- Window Dimensions & Zoom Constants ---
const COMPACT_WIDTH = 230;
const COMPACT_HEIGHT = 250;
const ZOOMED_WIDTH = 320;
const ZOOMED_HEIGHT = 350;
let isCurrentPetZoomed = false;

// --- Position Persistence & Screen Boundary Clamping ---
function loadSavedPositionConfig() {
    let isZoomed = false;
    let savedPos = null;

    try {
        if (fs.existsSync(POSITION_FILE)) {
            const raw = fs.readFileSync(POSITION_FILE, 'utf-8');
            const data = JSON.parse(raw);
            if (data && typeof data === 'object') {
                if (typeof data.isZoomed === 'boolean') {
                    isZoomed = data.isZoomed;
                }
                if (typeof data.x === 'number' && typeof data.y === 'number') {
                    savedPos = { x: data.x, y: data.y };
                }
            }
        }
    } catch (err) {
        console.error('[DevPet] Failed to read pet position config:', err);
    }

    const width = isZoomed ? ZOOMED_WIDTH : COMPACT_WIDTH;
    const height = isZoomed ? ZOOMED_HEIGHT : COMPACT_HEIGHT;

    const primary = screen.getPrimaryDisplay();
    const workArea = primary.workArea;
    const defaultX = workArea.x + workArea.width - width - 24;
    const defaultY = workArea.y + workArea.height - height - 24;

    const x = savedPos ? savedPos.x : defaultX;
    const y = savedPos ? savedPos.y : defaultY;
    const clamped = clampToWorkArea(x, y, width, height);

    return {
        x: clamped.x,
        y: clamped.y,
        width,
        height,
        isZoomed
    };
}

function loadSavedPosition(width = COMPACT_WIDTH, height = COMPACT_HEIGHT) {
    const config = loadSavedPositionConfig();
    return clampToWorkArea(config.x, config.y, width, height);
}

function clampToWorkArea(x, y, width, height) {
    const matchingDisplay = screen.getDisplayMatching({ x, y, width, height }) || screen.getPrimaryDisplay();
    const work = matchingDisplay.workArea;

    const clampedX = Math.max(work.x, Math.min(x, work.x + work.width - width));
    const clampedY = Math.max(work.y, Math.min(y, work.y + work.height - height));

    return { x: Math.round(clampedX), y: Math.round(clampedY) };
}

function savePosition(x, y, width = COMPACT_WIDTH, height = COMPACT_HEIGHT, isZoomed = isCurrentPetZoomed) {
    try {
        const clamped = clampToWorkArea(x, y, width, height);
        const data = {
            x: clamped.x,
            y: clamped.y,
            width,
            height,
            isZoomed: Boolean(isZoomed)
        };
        fs.writeFileSync(POSITION_FILE, JSON.stringify(data), 'utf-8');
    } catch (err) {
        console.error('[DevPet] Failed to save pet position:', err);
    }
}

// --- Window Creation ---
function createFloatingWindow() {
    if (floatingWindow && !floatingWindow.isDestroyed()) {
        if (floatingWindow.isMinimized()) floatingWindow.restore();
        floatingWindow.show();
        floatingWindow.setAlwaysOnTop(true, 'screen-saver');
        floatingWindow.focus();
        return;
    }

    const config = loadSavedPositionConfig();
    isCurrentPetZoomed = config.isZoomed;

    floatingWindow = new BrowserWindow({
        width: config.width,
        height: config.height,
        x: config.x,
        y: config.y,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        resizable: false,
        useContentSize: true,
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

    // Ensure floating window maintains screen-saver alwaysOnTop level
    floatingWindow.on('blur', () => {
        if (floatingWindow && !floatingWindow.isDestroyed()) {
            floatingWindow.setAlwaysOnTop(true, 'screen-saver');
        }
    });

    floatingWindow.loadFile(path.join(__dirname, 'floating.html'));

    let moveTimeout = null;
    floatingWindow.on('moved', () => {
        if (moveTimeout) clearTimeout(moveTimeout);
        moveTimeout = setTimeout(() => {
            if (floatingWindow && !floatingWindow.isDestroyed()) {
                const [x, y] = floatingWindow.getPosition();
                const [w, h] = floatingWindow.getSize();
                savePosition(x, y, w, h, isCurrentPetZoomed);
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
        if (floatingWindow && !floatingWindow.isDestroyed()) {
            floatingWindow.setAlwaysOnTop(true, 'screen-saver');
        }
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

    dashboardWindow.on('enter-full-screen', () => {
        if (dashboardWindow && !dashboardWindow.isDestroyed()) {
            dashboardWindow.webContents.send('dashboard-fullscreen-changed', true);
        }
    });

    dashboardWindow.on('leave-full-screen', () => {
        if (dashboardWindow && !dashboardWindow.isDestroyed()) {
            dashboardWindow.webContents.send('dashboard-fullscreen-changed', false);
        }
    });

    dashboardWindow.on('maximize', () => {
        if (dashboardWindow && !dashboardWindow.isDestroyed()) {
            dashboardWindow.webContents.send('dashboard-maximized-changed', true);
        }
    });

    dashboardWindow.on('unmaximize', () => {
        if (dashboardWindow && !dashboardWindow.isDestroyed()) {
            dashboardWindow.webContents.send('dashboard-maximized-changed', false);
        }
    });

    dashboardWindow.on('closed', () => {
        dashboardWindow = null;
    });

    if (floatingWindow && !floatingWindow.isDestroyed()) {
        floatingWindow.setAlwaysOnTop(true, 'screen-saver');
    }
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
                        if (floatingWindow.isMinimized()) floatingWindow.restore();
                        floatingWindow.show();
                        floatingWindow.setAlwaysOnTop(true, 'screen-saver');
                        floatingWindow.focus();
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
                label: 'Toggle Pet Zoom',
                click: () => {
                    if (floatingWindow && !floatingWindow.isDestroyed()) {
                        isCurrentPetZoomed = !isCurrentPetZoomed;
                        const w = isCurrentPetZoomed ? ZOOMED_WIDTH : COMPACT_WIDTH;
                        const h = isCurrentPetZoomed ? ZOOMED_HEIGHT : COMPACT_HEIGHT;
                        const [currX, currY] = floatingWindow.getPosition();
                        const matchingDisplay = screen.getDisplayMatching({ x: currX, y: currY, width: w, height: h }) || screen.getPrimaryDisplay();
                        const work = matchingDisplay.workArea;

                        let nextX = currX;
                        let nextY = currY;
                        if (nextX + w > work.x + work.width) nextX = work.x + work.width - w;
                        if (nextY + h > work.y + work.height) nextY = work.y + work.height - h;

                        const clamped = clampToWorkArea(nextX, nextY, w, h);
                        floatingWindow.setResizable(true);
                        floatingWindow.setSize(w, h);
                        floatingWindow.setResizable(false);
                        floatingWindow.setPosition(clamped.x, clamped.y);
                        savePosition(clamped.x, clamped.y, w, h, isCurrentPetZoomed);
                        floatingWindow.webContents.send('zoom-changed', isCurrentPetZoomed);
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
                        const w = isCurrentPetZoomed ? ZOOMED_WIDTH : COMPACT_WIDTH;
                        const h = isCurrentPetZoomed ? ZOOMED_HEIGHT : COMPACT_HEIGHT;
                        const x = work.x + work.width - w - 24;
                        const y = work.y + work.height - h - 24;
                        floatingWindow.setPosition(x, y);
                        savePosition(x, y, w, h, isCurrentPetZoomed);
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
            if (!floatingWindow || floatingWindow.isDestroyed()) {
                createFloatingWindow();
            } else {
                if (floatingWindow.isMinimized()) floatingWindow.restore();
                floatingWindow.show();
                floatingWindow.setAlwaysOnTop(true, 'screen-saver');
                floatingWindow.focus();
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

    ipcMain.handle('toggle-dashboard-fullscreen', () => {
        if (!dashboardWindow || dashboardWindow.isDestroyed()) return false;
        const willBeFs = !dashboardWindow.isFullScreen();
        dashboardWindow.setFullScreen(willBeFs);
        return willBeFs;
    });

    ipcMain.handle('get-dashboard-fullscreen', () => {
        if (!dashboardWindow || dashboardWindow.isDestroyed()) return false;
        return dashboardWindow.isFullScreen();
    });

    ipcMain.handle('toggle-dashboard-maximize', () => {
        if (!dashboardWindow || dashboardWindow.isDestroyed()) return false;
        if (dashboardWindow.isMaximized()) {
            dashboardWindow.unmaximize();
            return false;
        } else {
            dashboardWindow.maximize();
            return true;
        }
    });

    ipcMain.handle('get-dashboard-maximized', () => {
        if (!dashboardWindow || dashboardWindow.isDestroyed()) return false;
        return dashboardWindow.isMaximized();
    });

    ipcMain.on('minimize-dashboard', () => {
        if (dashboardWindow && !dashboardWindow.isDestroyed()) {
            dashboardWindow.minimize();
        }
    });

    ipcMain.handle('toggle-pet-zoom', (event) => {
        if (!floatingWindow || floatingWindow.isDestroyed()) {
            return { isZoomed: isCurrentPetZoomed };
        }
        if (event.sender !== floatingWindow.webContents) {
            return { isZoomed: isCurrentPetZoomed };
        }

        isCurrentPetZoomed = !isCurrentPetZoomed;
        const targetWidth = isCurrentPetZoomed ? ZOOMED_WIDTH : COMPACT_WIDTH;
        const targetHeight = isCurrentPetZoomed ? ZOOMED_HEIGHT : COMPACT_HEIGHT;

        const [currX, currY] = floatingWindow.getPosition();
        const matchingDisplay = screen.getDisplayMatching({ x: currX, y: currY, width: targetWidth, height: targetHeight }) || screen.getPrimaryDisplay();
        const work = matchingDisplay.workArea;

        let nextX = currX;
        let nextY = currY;
        if (nextX + targetWidth > work.x + work.width) {
            nextX = work.x + work.width - targetWidth;
        }
        if (nextY + targetHeight > work.y + work.height) {
            nextY = work.y + work.height - targetHeight;
        }

        const clamped = clampToWorkArea(nextX, nextY, targetWidth, targetHeight);
        floatingWindow.setResizable(true);
        floatingWindow.setSize(targetWidth, targetHeight);
        floatingWindow.setResizable(false);
        floatingWindow.setPosition(clamped.x, clamped.y);
        savePosition(clamped.x, clamped.y, targetWidth, targetHeight, isCurrentPetZoomed);

        return {
            isZoomed: isCurrentPetZoomed,
            width: targetWidth,
            height: targetHeight
        };
    });

    ipcMain.handle('get-pet-zoom', () => {
        return { isZoomed: isCurrentPetZoomed };
    });

    ipcMain.on('minimize-pet', () => {
        if (floatingWindow && !floatingWindow.isDestroyed()) {
            floatingWindow.hide();
        }
    });

    ipcMain.on('close-pet', () => {
        if (floatingWindow && !floatingWindow.isDestroyed()) {
            floatingWindow.hide();
        }
    });

    ipcMain.on('hide-pet', () => {
        if (floatingWindow && !floatingWindow.isDestroyed()) {
            floatingWindow.hide();
        }
    });

    ipcMain.on('show-pet', () => {
        if (!floatingWindow || floatingWindow.isDestroyed()) {
            createFloatingWindow();
        } else {
            if (floatingWindow.isMinimized()) floatingWindow.restore();
            floatingWindow.show();
            floatingWindow.setAlwaysOnTop(true, 'screen-saver');
            floatingWindow.focus();
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
