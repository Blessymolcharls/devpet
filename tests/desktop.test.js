// tests/desktop.test.js - Smoke test for Electron window initialization & configuration
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('Electron desktop companion files exist and are valid', (t) => {
    const mainJs = path.join(__dirname, '..', 'main.js');
    const preloadJs = path.join(__dirname, '..', 'preload.js');
    const floatingHtml = path.join(__dirname, '..', 'floating.html');
    const floatingCss = path.join(__dirname, '..', 'floating.css');
    const floatingJs = path.join(__dirname, '..', 'floating.js');

    assert.ok(fs.existsSync(mainJs), 'main.js must exist');
    assert.ok(fs.existsSync(preloadJs), 'preload.js must exist');
    assert.ok(fs.existsSync(floatingHtml), 'floating.html must exist');
    assert.ok(fs.existsSync(floatingCss), 'floating.css must exist');
    assert.ok(fs.existsSync(floatingJs), 'floating.js must exist');

    const mainContent = fs.readFileSync(mainJs, 'utf-8');
    assert.ok(mainContent.includes('transparent: true'), 'floating window must be transparent');
    assert.ok(mainContent.includes('alwaysOnTop: true'), 'floating window must be alwaysOnTop');
    assert.ok(mainContent.includes('frame: false'), 'floating window must be frameless');
    assert.ok(mainContent.includes('setIgnoreMouseEvents'), 'must support mouse event forwarding');

    const floatingCssContent = fs.readFileSync(floatingCss, 'utf-8');
    assert.ok(floatingCssContent.includes('background: transparent !important'), 'body must be transparent');
    assert.ok(!floatingCssContent.includes('.floating-pet-card'), 'card wrapper must be removed to prevent oversized rectangular background');
    assert.ok(floatingCssContent.includes('.floating-widget-card'), 'must have unified floating-widget-card');

    // Bounds & Window Configuration
    assert.ok(mainContent.includes('COMPACT_WIDTH = 230'), 'compact width must be 230');
    assert.ok(mainContent.includes('COMPACT_HEIGHT = 250'), 'compact height must be 250');
    assert.ok(mainContent.includes('ZOOMED_WIDTH = 320'), 'zoomed width must be 320');
    assert.ok(mainContent.includes('ZOOMED_HEIGHT = 350'), 'zoomed height must be 350');
    assert.ok(mainContent.includes('screen-saver'), 'must use screen-saver alwaysOnTop level');
    assert.ok(mainContent.includes('clampToWorkArea'), 'must clamp within monitor work area');
    assert.ok(mainContent.includes('savePosition'), 'must persist position safely');
    assert.ok(mainContent.includes('toggle-pet-zoom'), 'must handle toggle-pet-zoom IPC');
    assert.ok(mainContent.includes('minimize-pet'), 'must handle minimize-pet IPC');
    assert.ok(mainContent.includes('close-pet'), 'must handle close-pet IPC');

    // Floating HTML DOM elements & Control Order (Zoom, Minimize, Close)
    const floatingHtmlContent = fs.readFileSync(floatingHtml, 'utf-8');
    assert.ok(floatingHtmlContent.includes('id="drag-bar"'), 'header must be drag handle');
    assert.ok(floatingHtmlContent.includes('id="btn-zoom-pet"'), 'must have zoom button');
    assert.ok(floatingHtmlContent.includes('id="btn-minimize-pet"'), 'must have minimize button');
    assert.ok(floatingHtmlContent.includes('id="btn-close-pet"'), 'must have close button');

    // Check exact order: Zoom, Minimize, Close
    const zoomIdx = floatingHtmlContent.indexOf('id="btn-zoom-pet"');
    const minIdx = floatingHtmlContent.indexOf('id="btn-minimize-pet"');
    const closeIdx = floatingHtmlContent.indexOf('id="btn-close-pet"');
    assert.ok(zoomIdx !== -1 && minIdx !== -1 && closeIdx !== -1, 'all three controls must exist');
    assert.ok(zoomIdx < minIdx, 'Zoom must be to the left of Minimize');
    assert.ok(minIdx < closeIdx, 'Minimize must be to the left of Close');

    // Tooltips
    assert.ok(floatingHtmlContent.includes('title="Zoom/Restore"'), 'zoom must have Zoom/Restore tooltip');
    assert.ok(floatingHtmlContent.includes('title="Minimize"'), 'minimize must have Minimize tooltip');
    assert.ok(floatingHtmlContent.includes('title="Hide Companion"'), 'close must have Hide Companion tooltip');

    assert.ok(floatingHtmlContent.includes('id="btn-quick-task"'), 'must have quick task action');
    assert.ok(floatingHtmlContent.includes('id="btn-quick-pomo"'), 'must have pomodoro action');
    assert.ok(floatingHtmlContent.includes('id="btn-pet-interact"'), 'must have pet interact action');
    assert.ok(floatingHtmlContent.includes('stats-row'), 'must have compact stats row');

    // Preload API verification
    const preloadContent = fs.readFileSync(preloadJs, 'utf-8');
    assert.ok(preloadContent.includes('toggleZoom'), 'preload must expose toggleZoom');
    assert.ok(preloadContent.includes('minimizePet'), 'preload must expose minimizePet');
    assert.ok(preloadContent.includes('closePet'), 'preload must expose closePet');
    assert.ok(preloadContent.includes('toggleDashboardFullScreen'), 'preload must expose toggleDashboardFullScreen');
    assert.ok(preloadContent.includes('getDashboardFullScreen'), 'preload must expose getDashboardFullScreen');
    assert.ok(preloadContent.includes('toggleDashboardMaximize'), 'preload must expose toggleDashboardMaximize');
    assert.ok(preloadContent.includes('getDashboardMaximized'), 'preload must expose getDashboardMaximized');
    assert.ok(preloadContent.includes('minimizeDashboard'), 'preload must expose minimizeDashboard');
    assert.ok(preloadContent.includes('closeDashboard'), 'preload must expose closeDashboard');
    assert.ok(preloadContent.includes('onDashboardFullScreenChanged'), 'preload must expose onDashboardFullScreenChanged');
    assert.ok(preloadContent.includes('onDashboardMaximizedChanged'), 'preload must expose onDashboardMaximizedChanged');

    // Dashboard main.js handlers verification
    assert.ok(mainContent.includes('toggle-dashboard-fullscreen'), 'main.js must handle toggle-dashboard-fullscreen');
    assert.ok(mainContent.includes('get-dashboard-fullscreen'), 'main.js must handle get-dashboard-fullscreen');
    assert.ok(mainContent.includes('toggle-dashboard-maximize'), 'main.js must handle toggle-dashboard-maximize');
    assert.ok(mainContent.includes('get-dashboard-maximized'), 'main.js must handle get-dashboard-maximized');
    assert.ok(mainContent.includes('minimize-dashboard'), 'main.js must handle minimize-dashboard');
    assert.ok(mainContent.includes('close-dashboard'), 'main.js must handle close-dashboard');
    assert.ok(mainContent.includes('resizable: true'), 'main.js must ensure dashboardWindow is resizable');

    // Dashboard navigation & controls verification
    const indexHtml = path.join(__dirname, '..', 'index.html');
    const indexHtmlContent = fs.readFileSync(indexHtml, 'utf-8');
    assert.ok(indexHtmlContent.includes('id="btn-toggle-dash-pet"'), 'index.html must have btn-toggle-dash-pet');
    assert.ok(indexHtmlContent.includes('id="btn-fullscreen"'), 'index.html must have btn-fullscreen');
    assert.ok(indexHtmlContent.includes('id="btn-maximize-dash"'), 'index.html must have btn-maximize-dash');
    assert.ok(indexHtmlContent.includes('id="btn-minimize-dash"'), 'index.html must have btn-minimize-dash');
    assert.ok(indexHtmlContent.includes('id="btn-close-dash"'), 'index.html must have btn-close-dash');

    // Standard Windows control ordering: Minimize -> Maximize -> Close
    const dashMinIdx = indexHtmlContent.indexOf('id="btn-minimize-dash"');
    const dashMaxIdx = indexHtmlContent.indexOf('id="btn-maximize-dash"');
    const dashCloseIdx = indexHtmlContent.indexOf('id="btn-close-dash"');
    assert.ok(dashMinIdx !== -1 && dashMaxIdx !== -1 && dashCloseIdx !== -1, 'all dashboard window controls must exist');
    assert.ok(dashMinIdx < dashMaxIdx, 'Dashboard Minimize must be before Maximize');
    assert.ok(dashMaxIdx < dashCloseIdx, 'Dashboard Maximize must be before Close');

    // Standard Windows symbols in HTML
    assert.ok(indexHtmlContent.includes('—'), 'Minimize button must use — symbol');
    assert.ok(indexHtmlContent.includes('□'), 'Maximize button must use □ symbol');
    assert.ok(indexHtmlContent.includes('✕'), 'Close button must use ✕ symbol');

    // Style.css verification for draggable top-nav and window controls
    const styleCss = path.join(__dirname, '..', 'style.css');
    const styleCssContent = fs.readFileSync(styleCss, 'utf-8');
    assert.ok(styleCssContent.includes('window-controls'), 'style.css must style .window-controls');
    assert.ok(styleCssContent.includes('window-ctrl-btn'), 'style.css must style .window-ctrl-btn');
    assert.ok(styleCssContent.includes('-webkit-app-region: drag'), 'style.css must make title-bar draggable');

    // Script.js handlers verification
    const scriptJs = path.join(__dirname, '..', 'script.js');
    const scriptJsContent = fs.readFileSync(scriptJs, 'utf-8');
    assert.ok(scriptJsContent.includes('toggleFullScreen'), 'script.js must implement toggleFullScreen');
    assert.ok(scriptJsContent.includes('exitFullScreen'), 'script.js must implement exitFullScreen');
    assert.ok(scriptJsContent.includes('toggleMaximize'), 'script.js must implement toggleMaximize');
    assert.ok(scriptJsContent.includes('setMaximizeUI'), 'script.js must implement setMaximizeUI');
    assert.ok(scriptJsContent.includes("'❐'"), 'script.js must toggle to restore symbol ❐');
});

test('Two-State Mutually Exclusive Architecture (Dashboard vs Floating Companion)', (t) => {
    const mainJs = path.join(__dirname, '..', 'main.js');
    const preloadJs = path.join(__dirname, '..', 'preload.js');
    const floatingHtml = path.join(__dirname, '..', 'floating.html');
    const floatingJs = path.join(__dirname, '..', 'floating.js');
    const scriptJs = path.join(__dirname, '..', 'script.js');
    const styleCss = path.join(__dirname, '..', 'style.css');

    const mainContent = fs.readFileSync(mainJs, 'utf-8');
    assert.ok(mainContent.includes('switchToDashboardMode'), 'main.js must implement switchToDashboardMode');
    assert.ok(mainContent.includes('switchToFloatingMode'), 'main.js must implement switchToFloatingMode');
    assert.ok(mainContent.includes('enter-floating-mode'), 'main.js must handle enter-floating-mode IPC');
    assert.ok(mainContent.includes('return-to-dashboard'), 'main.js must handle return-to-dashboard IPC');
    assert.ok(mainContent.includes('get-app-mode'), 'main.js must handle get-app-mode IPC');
    assert.ok(mainContent.includes('switchToDashboardMode()'), 'main.js app.whenReady must start in Mode A (Dashboard)');

    const preloadContent = fs.readFileSync(preloadJs, 'utf-8');
    assert.ok(preloadContent.includes('enterFloatingMode'), 'preload.js must expose enterFloatingMode');
    assert.ok(preloadContent.includes('returnToDashboard'), 'preload.js must expose returnToDashboard');
    assert.ok(preloadContent.includes('getAppMode'), 'preload.js must expose getAppMode');
    assert.ok(preloadContent.includes('onAppModeChanged'), 'preload.js must expose onAppModeChanged');

    const floatingHtmlContent = fs.readFileSync(floatingHtml, 'utf-8');
    assert.ok(floatingHtmlContent.includes('id="btn-open-dash"'), 'floating.html must provide btn-open-dash control');
    assert.ok(floatingHtmlContent.includes('title="Return to Dashboard"'), 'floating.html return button must have clear tooltip');

    const floatingJsContent = fs.readFileSync(floatingJs, 'utf-8');
    assert.ok(floatingJsContent.includes('returnToDashboard'), 'floating.js must wire returnToDashboard on return control');

    const scriptJsContent = fs.readFileSync(scriptJs, 'utf-8');
    assert.ok(scriptJsContent.includes('enterFloatingMode'), 'script.js must call enterFloatingMode when Float Pet is clicked');

    const styleCssContent = fs.readFileSync(styleCss, 'utf-8');
    assert.ok(styleCssContent.includes('body.floating-active'), 'style.css must style browser preview mode');
    assert.ok(!styleCssContent.includes('background: transparent; display: none !important'), 'style.css must avoid transparent white blowout in browser preview');
});

