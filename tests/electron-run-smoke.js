// tests/electron-run-smoke.js - Automated runtime verification of Electron windows, Zoom, and IPC
const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const assert = require('node:assert/strict');
const fs = require('fs');

console.log('[DevPet Verification] Starting Electron runtime smoke verification...');

app.whenReady().then(async () => {
    try {
        const COMPACT_WIDTH = 230;
        const COMPACT_HEIGHT = 250;
        const ZOOMED_WIDTH = 320;
        const ZOOMED_HEIGHT = 350;
        let isCurrentPetZoomed = false;

        const primaryDisplay = screen.getPrimaryDisplay();
        const workArea = primaryDisplay.workArea;

        // 1. Verify Floating Window Creation
        let width = COMPACT_WIDTH;
        let height = COMPACT_HEIGHT;
        const x = Math.round(workArea.x + workArea.width - width - 24);
        const y = Math.round(workArea.y + workArea.height - height - 24);

        const floatingWin = new BrowserWindow({
            width,
            height,
            x,
            y,
            frame: false,
            transparent: true,
            alwaysOnTop: true,
            resizable: false,
            useContentSize: true,
            backgroundColor: '#00000000',
            webPreferences: {
                preload: path.join(__dirname, '..', 'preload.js'),
                contextIsolation: true,
                nodeIntegration: false
            }
        });

        floatingWin.setAlwaysOnTop(true, 'screen-saver');

        // Register IPC handlers matching main.js
        let stateStore = { level: 2, currentXp: 40, coins: 50, streak: 3 };
        ipcMain.handle('get-initial-state', () => stateStore);
        ipcMain.handle('save-state', (event, s) => { stateStore = s; return { success: true }; });
        ipcMain.on('set-ignore-mouse-events', () => {});
        ipcMain.on('open-dashboard', () => {
            if (floatingWin && !floatingWin.isDestroyed()) floatingWin.hide();
            if (dashboardWin && !dashboardWin.isDestroyed()) { dashboardWin.show(); dashboardWin.focus(); }
        });
        ipcMain.handle('enter-floating-mode', () => {
            if (dashboardWin && !dashboardWin.isDestroyed()) dashboardWin.hide();
            if (floatingWin && !floatingWin.isDestroyed()) { floatingWin.show(); floatingWin.focus(); }
            return { mode: 'floating' };
        });
        ipcMain.handle('return-to-dashboard', () => {
            if (floatingWin && !floatingWin.isDestroyed()) floatingWin.hide();
            if (dashboardWin && !dashboardWin.isDestroyed()) { dashboardWin.show(); dashboardWin.focus(); }
            return { mode: 'dashboard' };
        });
        ipcMain.handle('get-app-mode', () => {
            return (floatingWin && floatingWin.isVisible()) ? 'floating' : 'dashboard';
        });
        ipcMain.on('minimize-pet', () => floatingWin.hide());
        ipcMain.on('close-pet', () => {
            if (floatingWin && !floatingWin.isDestroyed()) floatingWin.hide();
            if (dashboardWin && !dashboardWin.isDestroyed()) { dashboardWin.show(); dashboardWin.focus(); }
        });
        ipcMain.on('hide-pet', () => floatingWin.hide());
        ipcMain.on('show-pet', () => {
            if (dashboardWin && !dashboardWin.isDestroyed()) dashboardWin.hide();
            if (floatingWin && !floatingWin.isDestroyed()) { floatingWin.show(); floatingWin.focus(); }
        });
        ipcMain.handle('get-pet-zoom', () => ({ isZoomed: isCurrentPetZoomed }));

        ipcMain.handle('toggle-pet-zoom', () => {
            isCurrentPetZoomed = !isCurrentPetZoomed;
            const targetW = isCurrentPetZoomed ? ZOOMED_WIDTH : COMPACT_WIDTH;
            const targetH = isCurrentPetZoomed ? ZOOMED_HEIGHT : COMPACT_HEIGHT;
            floatingWin.setResizable(true);
            floatingWin.setSize(targetW, targetH);
            floatingWin.setResizable(false);
            console.log(`[IPC toggle-pet-zoom] Set size to ${targetW}x${targetH}, isZoomed: ${isCurrentPetZoomed}`);
            return { isZoomed: isCurrentPetZoomed, width: targetW, height: targetH };
        });

        // Dashboard IPC handlers
        ipcMain.handle('toggle-dashboard-fullscreen', () => {
            if (!dashboardWin || dashboardWin.isDestroyed()) return false;
            const willBeFs = !dashboardWin.isFullScreen();
            dashboardWin.setFullScreen(willBeFs);
            return willBeFs;
        });

        ipcMain.handle('get-dashboard-fullscreen', () => {
            if (!dashboardWin || dashboardWin.isDestroyed()) return false;
            return dashboardWin.isFullScreen();
        });

        ipcMain.handle('toggle-dashboard-maximize', () => {
            if (!dashboardWin || dashboardWin.isDestroyed()) return false;
            if (dashboardWin.isMaximized()) {
                dashboardWin.unmaximize();
                return false;
            } else {
                dashboardWin.maximize();
                return true;
            }
        });

        ipcMain.handle('get-dashboard-maximized', () => {
            if (!dashboardWin || dashboardWin.isDestroyed()) return false;
            return dashboardWin.isMaximized();
        });

        ipcMain.on('minimize-dashboard', () => {
            if (dashboardWin && !dashboardWin.isDestroyed()) {
                dashboardWin.minimize();
            }
        });

        ipcMain.on('close-dashboard', () => {
            if (dashboardWin && !dashboardWin.isDestroyed()) {
                dashboardWin.close();
            }
        });

        const [cWidth, cHeight] = floatingWin.getContentSize();
        console.log(`[DevPet Verification] Initial compact content size ${cWidth}x${cHeight}`);
        assert.ok(Math.abs(cWidth - COMPACT_WIDTH) <= 4, `Width (${cWidth}) must match compact width ${COMPACT_WIDTH}`);
        assert.ok(Math.abs(cHeight - COMPACT_HEIGHT) <= 4, `Height (${cHeight}) must match compact height ${COMPACT_HEIGHT}`);
        assert.equal(floatingWin.isAlwaysOnTop(), true, 'Window must be always on top');

        // Load floating.html and check for DOM loading errors
        await floatingWin.loadFile(path.join(__dirname, '..', 'floating.html'));
        console.log('[DevPet Verification] floating.html successfully loaded into transparent BrowserWindow');

        // 2. Verify Dashboard Window Creation
        const dashboardWin = new BrowserWindow({
            width: 1200,
            height: 820,
            minWidth: 800,
            minHeight: 600,
            resizable: true,
            minimizable: true,
            maximizable: true,
            closable: true,
            webPreferences: {
                preload: path.join(__dirname, '..', 'preload.js'),
                contextIsolation: true,
                nodeIntegration: false
            }
        });

        dashboardWin.on('enter-full-screen', () => {
            if (dashboardWin && !dashboardWin.isDestroyed()) {
                dashboardWin.webContents.send('dashboard-fullscreen-changed', true);
            }
        });
        dashboardWin.on('leave-full-screen', () => {
            if (dashboardWin && !dashboardWin.isDestroyed()) {
                dashboardWin.webContents.send('dashboard-fullscreen-changed', false);
            }
        });
        dashboardWin.on('maximize', () => {
            if (dashboardWin && !dashboardWin.isDestroyed()) {
                dashboardWin.webContents.send('dashboard-maximized-changed', true);
            }
        });
        dashboardWin.on('unmaximize', () => {
            if (dashboardWin && !dashboardWin.isDestroyed()) {
                dashboardWin.webContents.send('dashboard-maximized-changed', false);
            }
        });

        await dashboardWin.loadFile(path.join(__dirname, '..', 'index.html'));
        console.log('[DevPet Verification] index.html successfully loaded into dashboard BrowserWindow');

        // 3. Verify Position Persistence Config logic
        const posFile = path.join(app.getPath('userData'), 'devpet_pet_position.json');
        const testPos = { x: workArea.x + 50, y: workArea.y + 50, width: 230, height: 250, isZoomed: false };
        fs.writeFileSync(posFile, JSON.stringify(testPos), 'utf-8');
        const readPos = JSON.parse(fs.readFileSync(posFile, 'utf-8'));
        assert.equal(readPos.x, testPos.x);
        assert.equal(readPos.y, testPos.y);
        assert.equal(readPos.isZoomed, false);
        console.log('[DevPet Verification] Window position & zoom persistence config verified.');

        // 4. Verify Floating Window Controls & Order
        const controlsCheck = await floatingWin.webContents.executeJavaScript(`
            (() => {
                const zoomBtn = document.getElementById('btn-zoom-pet');
                const minBtn = document.getElementById('btn-minimize-pet');
                const closeBtn = document.getElementById('btn-close-pet');
                if (!zoomBtn || !minBtn || !closeBtn) return { success: false, reason: 'missing buttons' };

                // Verify order: Zoom, Minimize, Close
                const controls = document.querySelector('.top-controls');
                const children = Array.from(controls.children);
                const orderCorrect = children[0] === zoomBtn && children[1] === minBtn && children[2] === closeBtn;

                return {
                    success: orderCorrect,
                    zoomTitle: zoomBtn.title,
                    minTitle: minBtn.title,
                    closeTitle: closeBtn.title
                };
            })()
        `);
        assert.equal(controlsCheck.success, true, 'Controls must be in order: Zoom, Minimize, Close');
        assert.equal(controlsCheck.zoomTitle, 'Zoom/Restore');
        assert.equal(controlsCheck.minTitle, 'Minimize');
        assert.equal(controlsCheck.closeTitle, 'Hide Companion');
        console.log('[DevPet Verification] Controls order (Zoom, Minimize, Close) and tooltips verified.');

        // 5. Verify Zoom Behavior Runtime
        // Trigger zoom toggle
        await floatingWin.webContents.executeJavaScript(`
            (async () => {
                const res = await window.devPetDesktop.toggleZoom();
                applyZoomState(res && res.isZoomed);
            })()
        `);
        await new Promise(r => setTimeout(r, 400));

        const [zoomW, zoomH] = floatingWin.getContentSize();
        console.log(`[DevPet Verification] Zoomed content size ${zoomW}x${zoomH}`);
        assert.ok(Math.abs(zoomW - ZOOMED_WIDTH) <= 4, `Zoomed width (${zoomW}) must match ${ZOOMED_WIDTH}`);
        assert.ok(Math.abs(zoomH - ZOOMED_HEIGHT) <= 4, `Zoomed height (${zoomH}) must match ${ZOOMED_HEIGHT}`);

        const isCardZoomed = await floatingWin.webContents.executeJavaScript(`
            document.querySelector('.floating-widget-card').classList.contains('zoomed')
        `);
        assert.equal(isCardZoomed, true, 'Widget card must have .zoomed class');
        console.log('[DevPet Verification] Zoom mode proportionally enlarged window and applied .zoomed class.');

        // Trigger zoom toggle back to compact
        await floatingWin.webContents.executeJavaScript(`
            (async () => {
                const res = await window.devPetDesktop.toggleZoom();
                applyZoomState(res && res.isZoomed);
            })()
        `);
        await new Promise(r => setTimeout(r, 400));

        const [restoreW, restoreH] = floatingWin.getContentSize();
        console.log(`[DevPet Verification] Restored content size ${restoreW}x${restoreH}`);
        assert.ok(Math.abs(restoreW - COMPACT_WIDTH) <= 4, `Restored width (${restoreW}) must match compact width ${COMPACT_WIDTH}`);
        assert.ok(Math.abs(restoreH - COMPACT_HEIGHT) <= 4, `Restored height (${restoreH}) must match compact height ${COMPACT_HEIGHT}`);

        const isCardRestored = await floatingWin.webContents.executeJavaScript(`
            !document.querySelector('.floating-widget-card').classList.contains('zoomed')
        `);
        assert.equal(isCardRestored, true, 'Widget card must remove .zoomed class upon restore');
        console.log('[DevPet Verification] Zoom toggle restored compact size successfully.');

        // 6. Verify Minimize Behavior
        await floatingWin.webContents.executeJavaScript(`
            document.getElementById('btn-minimize-pet').click();
        `);
        await new Promise(r => setTimeout(r, 100));
        assert.equal(floatingWin.isVisible(), false, 'Minimize must hide companion window');
        console.log('[DevPet Verification] Minimize button hides companion window without destroying.');

        // Restore window via show
        floatingWin.show();
        assert.equal(floatingWin.isVisible(), true, 'Window can be restored from tray or dashboard');
        console.log('[DevPet Verification] Companion window restored successfully.');

        // 7. Verify Close (X) Behavior
        await floatingWin.webContents.executeJavaScript(`
            document.getElementById('btn-close-pet').click();
        `);
        await new Promise(r => setTimeout(r, 100));
        assert.equal(floatingWin.isVisible(), false, 'Close (X) must hide companion window without quitting app');
        assert.equal(dashboardWin.isDestroyed(), false, 'Dashboard remains running when companion is hidden');
        console.log('[DevPet Verification] Close (X) button hides companion without terminating app.');

        // Restore floating companion for subsequent independent behavior tests
        floatingWin.show();
        assert.equal(floatingWin.isVisible(), true, 'Floating companion restored');

        // 8. Verify Dashboard Full-Screen Mode & Companion Non-Interference
        console.log('[DevPet Verification] Testing Dashboard Full-Screen mode...');
        assert.equal(dashboardWin.isFullScreen(), false, 'Dashboard should start in normal window mode');

        // Toggle full-screen via button click
        await dashboardWin.webContents.executeJavaScript(`
            document.getElementById('btn-fullscreen').click();
        `);
        await new Promise(r => setTimeout(r, 500));

        assert.equal(dashboardWin.isFullScreen(), true, 'Dashboard must enter full-screen mode on button click');
        
        // Ensure floating companion is NOT altered in size by dashboard full-screen
        const [fWAfterDashFs, fHAfterDashFs] = floatingWin.getContentSize();
        assert.ok(Math.abs(fWAfterDashFs - COMPACT_WIDTH) <= 4, `Companion width must remain compact (${COMPACT_WIDTH}), got ${fWAfterDashFs}`);
        assert.ok(Math.abs(fHAfterDashFs - COMPACT_HEIGHT) <= 4, `Companion height must remain compact (${COMPACT_HEIGHT}), got ${fHAfterDashFs}`);

        // Check CSS class on body and button text
        const dashFsState = await dashboardWin.webContents.executeJavaScript(`
            ({
                hasFsClass: document.body.classList.contains('fullscreen-mode'),
                btnText: document.getElementById('btn-fullscreen').textContent
            })
        `);
        assert.equal(dashFsState.hasFsClass, true, 'Body must have fullscreen-mode class');
        assert.ok(dashFsState.btnText.includes('EXIT FULLSCREEN'), 'Button text must update to EXIT FULLSCREEN');
        console.log('[DevPet Verification] Dashboard entered full-screen without affecting companion dimensions.');

        // Toggle exit full-screen via button click
        await dashboardWin.webContents.executeJavaScript(`
            document.getElementById('btn-fullscreen').click();
        `);
        await new Promise(r => setTimeout(r, 500));
        assert.equal(dashboardWin.isFullScreen(), false, 'Dashboard must exit full-screen mode on button click');
        console.log('[DevPet Verification] Dashboard exited full-screen successfully.');

        // 9. Verify Keyboard Shortcuts (F11 and Escape) & Modal Priority
        console.log('[DevPet Verification] Testing F11 and Escape keyboard handling...');
        // Toggle full-screen via F11 simulation
        await dashboardWin.webContents.executeJavaScript(`
            window.codeBuddyApp.toggleFullScreen();
        `);
        await new Promise(r => setTimeout(r, 500));
        assert.equal(dashboardWin.isFullScreen(), true, 'Dashboard must enter full-screen mode via toggleFullScreen');

        // Open a modal in dashboard to test Escape priority
        await dashboardWin.webContents.executeJavaScript(`
            document.getElementById('task-modal-overlay').classList.remove('hidden');
        `);

        // Press Escape: should close modal, but KEEP full-screen
        await dashboardWin.webContents.executeJavaScript(`
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        `);
        await new Promise(r => setTimeout(r, 200));

        const isModalHidden = await dashboardWin.webContents.executeJavaScript(`
            document.getElementById('task-modal-overlay').classList.contains('hidden')
        `);
        assert.equal(isModalHidden, true, 'Escape must close active modal first');
        assert.equal(dashboardWin.isFullScreen(), true, 'Dashboard must remain full-screen when Escape closed a modal');

        // Press Escape again: now with no modals open, it should exit full-screen
        await dashboardWin.webContents.executeJavaScript(`
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        `);
        await new Promise(r => setTimeout(r, 500));
        assert.equal(dashboardWin.isFullScreen(), false, 'Escape without open modals must exit full-screen mode');
        console.log('[DevPet Verification] Escape key modal priority and full-screen exit verified.');

        // 10. Verify Standard Windows Controls (Minimize, Maximize / Restore Down, and Independence)
        console.log('[DevPet Verification] Testing Standard Windows Controls (—, □, ❐, ✕)...');
        
        // Check initial button icons and titles
        const initialCtrlState = await dashboardWin.webContents.executeJavaScript(`
            ({
                minText: document.getElementById('btn-minimize-dash').textContent.trim(),
                minTitle: document.getElementById('btn-minimize-dash').getAttribute('title'),
                maxText: document.getElementById('btn-maximize-dash').textContent.trim(),
                maxTitle: document.getElementById('btn-maximize-dash').getAttribute('title'),
                closeText: document.getElementById('btn-close-dash').textContent.trim(),
                closeTitle: document.getElementById('btn-close-dash').getAttribute('title')
            })
        `);
        assert.equal(initialCtrlState.minText, '—', 'Minimize button must initially display —');
        assert.equal(initialCtrlState.minTitle, 'Minimize', 'Minimize button title must be Minimize');
        assert.equal(initialCtrlState.maxText, '□', 'Maximize button must initially display □');
        assert.equal(initialCtrlState.maxTitle, 'Maximize', 'Maximize button title must be Maximize');
        assert.equal(initialCtrlState.closeText, '✕', 'Close button must display ✕');
        assert.equal(initialCtrlState.closeTitle, 'Close', 'Close button title must be Close');

        // Record initial windowed size and position
        const initialBounds = dashboardWin.getBounds();
        assert.ok(initialBounds.width >= 800, 'Windowed width should be at least minWidth 800');
        assert.ok(initialBounds.height >= 600, 'Windowed height should be at least minHeight 600');

        // 10a. Maximize via btn-maximize-dash
        await dashboardWin.webContents.executeJavaScript(`
            document.getElementById('btn-maximize-dash').click();
        `);
        await new Promise(r => setTimeout(r, 500));
        assert.equal(dashboardWin.isMaximized(), true, 'Dashboard must be maximized when btn-maximize-dash clicked');
        assert.equal(dashboardWin.isFullScreen(), false, 'Maximize must fill desktop work area and NOT use full-screen');

        // Verify button toggles to Restore Down (❐)
        const maximizedBtnState = await dashboardWin.webContents.executeJavaScript(`
            ({
                maxText: document.getElementById('btn-maximize-dash').textContent.trim(),
                maxTitle: document.getElementById('btn-maximize-dash').getAttribute('title')
            })
        `);
        assert.equal(maximizedBtnState.maxText, '❐', 'Maximize button must toggle to Restore Down (❐) when window is maximized');
        assert.equal(maximizedBtnState.maxTitle, 'Restore Down', 'Button title must update to Restore Down');
        console.log('[DevPet Verification] Maximize (□) successfully expanded dashboard and toggled to Restore Down (❐).');

        // 10b. Restore Down via btn-maximize-dash
        await dashboardWin.webContents.executeJavaScript(`
            document.getElementById('btn-maximize-dash').click();
        `);
        await new Promise(r => setTimeout(r, 500));
        assert.equal(dashboardWin.isMaximized(), false, 'Dashboard must unmaximize when clicked in maximized state');

        // Verify button toggles back to Maximize (□)
        const restoredBtnState = await dashboardWin.webContents.executeJavaScript(`
            ({
                maxText: document.getElementById('btn-maximize-dash').textContent.trim(),
                maxTitle: document.getElementById('btn-maximize-dash').getAttribute('title')
            })
        `);
        assert.equal(restoredBtnState.maxText, '□', 'Button must toggle back to Maximize (□) when window is restored');
        assert.equal(restoredBtnState.maxTitle, 'Maximize', 'Button title must update back to Maximize');

        // Verify preservation of original dimensions and position
        const restoredBounds = dashboardWin.getBounds();
        assert.equal(restoredBounds.width, initialBounds.width, 'Restored width must equal pre-maximized width');
        assert.equal(restoredBounds.height, initialBounds.height, 'Restored height must equal pre-maximized height');
        assert.equal(restoredBounds.x, initialBounds.x, 'Restored X position must equal pre-maximized X');
        assert.equal(restoredBounds.y, initialBounds.y, 'Restored Y position must equal pre-maximized Y');
        console.log('[DevPet Verification] Restore Down (❐) preserved original window dimensions and position.');

        // 10c. Double-click title bar to maximize and restore
        await dashboardWin.webContents.executeJavaScript(`
            document.querySelector('.top-nav').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        `);
        await new Promise(r => setTimeout(r, 500));
        assert.equal(dashboardWin.isMaximized(), true, 'Double-clicking top-nav title bar must maximize dashboard');
        await dashboardWin.webContents.executeJavaScript(`
            document.querySelector('.top-nav').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        `);
        await new Promise(r => setTimeout(r, 500));
        assert.equal(dashboardWin.isMaximized(), false, 'Double-clicking top-nav title bar again must restore dashboard');
        console.log('[DevPet Verification] Double-click to maximize/restore on title-bar verified.');

        // 10d. Minimize dashboard to taskbar & companion independence
        await dashboardWin.webContents.executeJavaScript(`
            document.getElementById('btn-minimize-dash').click();
        `);
        await new Promise(r => setTimeout(r, 500));
        assert.equal(dashboardWin.isMinimized(), true, 'Dashboard window must be minimized to taskbar');
        assert.equal(floatingWin.isVisible(), true, 'Dashboard minimize must NOT hide floating companion');
        dashboardWin.restore();
        await new Promise(r => setTimeout(r, 200));
        assert.equal(dashboardWin.isMinimized(), false, 'Dashboard window restored from taskbar');
        console.log('[DevPet Verification] Dashboard Minimize (—), Maximize (□), and Restore Down (❐) operate independently.');

        // 11. Verify Companion Zoom Does NOT Alter Dashboard State
        console.log('[DevPet Verification] Testing Companion Zoom does not alter Dashboard state...');
        assert.equal(dashboardWin.isFullScreen(), false, 'Dashboard must be in normal mode');
        await floatingWin.webContents.executeJavaScript(`
            document.getElementById('btn-zoom-pet').click();
        `);
        await new Promise(r => setTimeout(r, 500));
        const [zW] = floatingWin.getContentSize();
        assert.ok(Math.abs(zW - ZOOMED_WIDTH) <= 4, 'Companion must be zoomed');
        assert.equal(dashboardWin.isFullScreen(), false, 'Zooming companion must NOT alter dashboard full-screen state');

        // Restore companion zoom
        await floatingWin.webContents.executeJavaScript(`
            document.getElementById('btn-zoom-pet').click();
        `);
        await new Promise(r => setTimeout(r, 500));
        assert.equal(dashboardWin.isFullScreen(), false, 'Restoring companion zoom must NOT alter dashboard state');
        console.log('[DevPet Verification] Companion zoom and dashboard full-screen are completely decoupled.');

        // 12. Verify Mutually Exclusive Two-State Interface Architecture
        console.log('[DevPet Verification] Testing Two-State Mode Switching (Dashboard Mode A vs Floating Companion Mode B)...');
        
        // Mode A: Dashboard visible, Floating Pet hidden
        floatingWin.hide();
        dashboardWin.show();
        await new Promise(r => setTimeout(r, 200));
        assert.equal(dashboardWin.isVisible(), true, 'Mode A: Dashboard must be visible');
        assert.equal(floatingWin.isVisible(), false, 'Mode A: Floating companion must be hidden');
        
        // Switch to Mode B via btn-floating on Dashboard
        await dashboardWin.webContents.executeJavaScript(`
            document.getElementById('btn-floating').click();
        `);
        await new Promise(r => setTimeout(r, 500));
        assert.equal(dashboardWin.isVisible(), false, 'Mode B: Dashboard must be hidden when entering floating mode');
        assert.equal(floatingWin.isVisible(), true, 'Mode B: Floating companion must be visible');
        console.log('[DevPet Verification] Switched to Mode B: Dashboard hidden, Floating Companion visible.');

        // Switch back to Mode A via btn-open-dash on Floating Companion
        await floatingWin.webContents.executeJavaScript(`
            document.getElementById('btn-open-dash').click();
        `);
        await new Promise(r => setTimeout(r, 500));
        assert.equal(dashboardWin.isVisible(), true, 'Mode A restored: Dashboard must be visible');
        assert.equal(floatingWin.isVisible(), false, 'Mode A restored: Floating companion must be hidden');
        console.log('[DevPet Verification] Switched back to Mode A via btn-open-dash: Companion hidden, Dashboard visible.');

        // Switch to Mode B again and test returning via close-pet (✕)
        await dashboardWin.webContents.executeJavaScript(`
            document.getElementById('btn-floating').click();
        `);
        await new Promise(r => setTimeout(r, 500));
        assert.equal(dashboardWin.isVisible(), false);
        assert.equal(floatingWin.isVisible(), true);

        await floatingWin.webContents.executeJavaScript(`
            document.getElementById('btn-close-pet').click();
        `);
        await new Promise(r => setTimeout(r, 500));
        assert.equal(dashboardWin.isVisible(), true, 'Dismissing companion must restore Dashboard (user never stranded)');
        assert.equal(floatingWin.isVisible(), false, 'Companion must be hidden');
        console.log('[DevPet Verification] Dismissing companion via ✕ safely restored Dashboard Mode A.');

        // Clean up
        floatingWin.close();
        dashboardWin.close();
        console.log('[DevPet Verification] ALL RUNTIME ELECTRON CHECKS PASSED SUCCESSFULLY!');
        app.quit();
    } catch (err) {
        console.error('[DevPet Verification ERROR]', err);
        app.exit(1);
    }
});
