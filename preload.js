// preload.js - Secure Context Bridge for DevPet 2.0
const { contextBridge, ipcRenderer } = require('electron');

// Expose safe, validated APIs to renderer window
contextBridge.exposeInMainWorld('devPetDesktop', {
    isDesktop: true,

    getInitialState: async () => {
        try {
            return await ipcRenderer.invoke('get-initial-state');
        } catch (err) {
            console.error('[Preload] getInitialState error:', err);
            return null;
        }
    },

    saveState: async (state) => {
        try {
            if (!state || typeof state !== 'object') {
                return { success: false, error: 'Invalid state' };
            }
            return await ipcRenderer.invoke('save-state', state);
        } catch (err) {
            console.error('[Preload] saveState error:', err);
            return { success: false, error: err.message };
        }
    },

    onStateUpdated: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const listener = (event, newState) => {
            try {
                callback(newState);
            } catch (err) {
                console.error('[Preload] onStateUpdated callback error:', err);
            }
        };
        ipcRenderer.on('state-updated', listener);
        // Return unsubscribe cleanup function
        return () => {
            ipcRenderer.removeListener('state-updated', listener);
        };
    },

    setIgnoreMouseEvents: (ignore, options = { forward: true }) => {
        ipcRenderer.send('set-ignore-mouse-events', Boolean(ignore), options);
    },

    openDashboard: () => {
        ipcRenderer.send('open-dashboard');
    },

    closeDashboard: () => {
        ipcRenderer.send('close-dashboard');
    },

    toggleZoom: async () => {
        try {
            return await ipcRenderer.invoke('toggle-pet-zoom');
        } catch (err) {
            console.error('[Preload] toggleZoom error:', err);
            return { isZoomed: false };
        }
    },

    getZoomState: async () => {
        try {
            return await ipcRenderer.invoke('get-pet-zoom');
        } catch (err) {
            console.error('[Preload] getZoomState error:', err);
            return { isZoomed: false };
        }
    },

    onZoomChanged: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const listener = (event, isZoomed) => {
            try {
                callback(Boolean(isZoomed));
            } catch (err) {
                console.error('[Preload] onZoomChanged callback error:', err);
            }
        };
        ipcRenderer.on('zoom-changed', listener);
        return () => {
            ipcRenderer.removeListener('zoom-changed', listener);
        };
    },

    minimizePet: () => {
        ipcRenderer.send('minimize-pet');
    },

    closePet: () => {
        ipcRenderer.send('close-pet');
    },

    hidePet: () => {
        ipcRenderer.send('hide-pet');
    },

    showPet: () => {
        ipcRenderer.send('show-pet');
    },

    quitApp: () => {
        ipcRenderer.send('quit-app');
    },

    savePetPosition: async (x, y) => {
        if (typeof x !== 'number' || typeof y !== 'number') return false;
        return await ipcRenderer.invoke('save-pet-position', { x, y });
    }
});
