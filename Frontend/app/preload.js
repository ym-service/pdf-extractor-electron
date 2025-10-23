﻿// preload.js
// Runs in an isolated context. Exports safe bridges to window.*
"use strict";

const { contextBridge, ipcRenderer, webFrame } = require("electron");

// A helper function to safely invoke IPC channels and log errors.
const safeInvoke = (channel, ...args) =>
    ipcRenderer.invoke(channel, ...args).catch((err) => {
        console.error(`[preload] invoke ${channel} failed:`, err);
        throw err;
    });

// Guard against re-initialization (e.g., during hot-reloading in development).
if (!globalThis.__preloadInitialized__) {
    Object.defineProperty(globalThis, "__preloadInitialized__", {
        value: true,
        configurable: false,
        enumerable: false,
        writable: false,
    });

    // A single, unified API object to expose to the renderer process.
    const api = {
        // --- App Info ---
        getAppName: () => safeInvoke("get-app-name"),
        getAppVersion: () => safeInvoke("get-app-version"),

        // --- File Viewing ---
        openFileInSystem: (filePath) =>
            ipcRenderer.invoke("open-file-in-default-app", filePath),
        openFileInBuiltin: (filePath, page) =>
            ipcRenderer.invoke("open-file-in-builtin-viewer", filePath, page),

        // --- Window Controls ---
        minimize: () => ipcRenderer.send("window-control", "minimize"),
        maximize: () => ipcRenderer.send("window-control", "maximize"),
        close: () => ipcRenderer.send("window-control", "close"),
        onWindowStateChange: (cb) => {
            if (typeof cb !== "function") return () => {};
            const handler = (_e, state) => cb(state);
            ipcRenderer.on("window:is-maximized", handler);
            return () =>
                ipcRenderer.removeListener("window:is-maximized", handler);
        },

        // --- Settings Window & Data ---
        openSettingsWindow: () => ipcRenderer.send("open-settings-window"),
        getSettings: () => safeInvoke("get-settings"),
        saveSettings: (settings) => safeInvoke("save-settings", settings),
        onSettingsUpdated: (callback) => {
            const handler = (_event, settings) => callback(settings);
            ipcRenderer.on("settings-updated", handler);
            return () =>
                ipcRenderer.removeListener("settings-updated", handler);
        },

        // --- i18n ---
        loadTranslation: (lang) => safeInvoke("load-translation", lang), // главный UI
        loadSettingsTranslation: (lang) =>
            safeInvoke("load-settings-translation", lang), // окно настроек
        setLanguage: (lang) => safeInvoke("set-language", lang),
        getLanguage: () => safeInvoke("get-language"),

        // --- Backend ---
        runAnalysis: (filePaths, options) =>
            safeInvoke("run-analysis", filePaths, options),
        exportReport: (payload) => safeInvoke("export-report", payload),

        isOcrAvailable: () => safeInvoke("is-ocr-available"),

        // --- File/Link Operations ---
        openExternalLink: (url) => ipcRenderer.send("open-external-link", url),
        openPdfAtPage: (payload) => safeInvoke("open-pdf-at-page", payload),
        showOpenDialog: () => safeInvoke("show-open-dialog"),

        // --- Find (Ctrl/Cmd+F) ---
        findShow: () => ipcRenderer.send("find:show"),
        onFindShow: (cb) => {
            if (typeof cb !== "function") return () => {};
            const handler = () => cb();
            ipcRenderer.on("find:show", handler);
            return () => ipcRenderer.removeListener("find:show", handler);
        },
        findSearch: (text, opts = {}) =>
            ipcRenderer.send("find:text", text, opts),
        findStop: (action = "clearSelection") =>
            ipcRenderer.send("find:stop", action),

        // --- UI Scale ---
        uiScaleGet: () => safeInvoke("uiScale:get"),
        uiScaleSet: (factor) => safeInvoke("uiScale:set", factor),

        // --- Updates ---
        checkForUpdates: () => ipcRenderer.send("check-for-updates"),

        // --- Titlebar Overlay (safe no-op for our frameless window) ---
        updateTitlebarColor: (colorOptions) =>
            ipcRenderer.send("update-titlebar-color", colorOptions),

        // --- Zoom ---
        setZoomFactor: (factor) => webFrame.setZoomFactor(factor),
    };

    // Expose the unified API to the isolated world.
    contextBridge.exposeInMainWorld("electronAPI", api);
}
