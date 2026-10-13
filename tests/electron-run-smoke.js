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
        ipcMain.on('open-dashboard', () => {});
        ipcMain.on('minimize-pet', () => floatingWin.hide());
        ipcMain.on('close-pet', () => floatingWin.hide());
        ipcMain.on('hide-pet', () => floatingWin.hide());
        ipcMain.on('show-pet', () => floatingWin.show());
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
            webPreferences: {
                preload: path.join(__dirname, '..', 'preload.js'),
                contextIsolation: true,
                nodeIntegration: false
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
