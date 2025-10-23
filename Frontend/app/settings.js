document.addEventListener('DOMContentLoaded', async function() {
    const ui = {
        tabs: document.querySelectorAll('.sidebar-item'),
        tabContents: document.querySelectorAll('.tab-content'),
        prefixInput: document.getElementById('prefix-input'),
        maxDigitsInput: document.getElementById('max-digits-input'),
        includeRevisionCheckbox: document.getElementById('include-revision-checkbox'),
        themeSelect: document.getElementById('theme-select'),
        pdfViewerModeSelect: document.getElementById('pdf-viewer-mode'),
        saveBtn: document.getElementById('save-btn'),
        cancelBtn: document.getElementById('cancel-btn'),
        minimizeBtn: document.getElementById('minimize-btn'),
        maximizeBtn: document.getElementById('maximize-btn'),
        closeBtn: document.getElementById('close-btn'),
        appNameDisplay: document.getElementById('app-name-display'),
        versionDisplay: document.getElementById('app-version-display'),
        updatesLink: document.getElementById('check-for-updates-link'),
        latestRevisionCheckbox: document.getElementById('latest-revision-checkbox'),
        removeDuplicatesCheckbox: document.getElementById('remove-duplicates-checkbox'),
        useOcrCheckbox: document.getElementById('use-ocr-checkbox'),
        screenshotWidthInput: document.getElementById('screenshot-width-input'),
        screenshotHeightInput: document.getElementById('screenshot-height-input'),
        textPosXSlider: document.getElementById('text-pos-x-slider'),
        textPosYSlider: document.getElementById('text-pos-y-slider'),
        textPosXValue: document.getElementById('text-pos-x-value'),
        textPosYValue: document.getElementById('text-pos-y-value'),
        settingsCapturePreviewBox: document.getElementById('settings-capture-preview-box'),
        settingsCaptureTextPreview: document.getElementById('settings-capture-text-preview'),

        uiScaleMain: document.getElementById('ui-scale-main'),
        uiScaleMainValue: document.getElementById('ui-scale-main-value'),
        uiScaleSettings: document.getElementById('ui-scale-settings'),
        uiScaleSettingsValue: document.getElementById('ui-scale-settings-value'),
        languageButtons: document.querySelectorAll('aside button[data-lang]'),
    };

    let currentTranslations = {};
    let currentAppVersion = '';

    // --- Tabs ---
    ui.tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            ui.tabs.forEach(item => item.classList.remove('active'));
            tab.classList.add('active');
            const targetId = tab.getAttribute('data-tab');
            ui.tabContents.forEach(content => content.classList.add('hidden'));
            document.getElementById(targetId)?.classList.remove('hidden');
        });
    });

    // --- Preview ---
    function updateCapturePreviewForSettings() {
        if (!ui.screenshotWidthInput || !ui.screenshotHeightInput || !ui.textPosXSlider || !ui.textPosYSlider || !ui.settingsCapturePreviewBox || !ui.settingsCaptureTextPreview) {
            return;
        }
        const width = Math.max(20, parseInt(ui.screenshotWidthInput.value, 10) || 200);
        const height = Math.max(20, parseInt(ui.screenshotHeightInput.value, 10) || 68);
        const posX = ui.textPosXSlider.value || 50;
        const posY = ui.textPosYSlider.value || 50;

        ui.settingsCapturePreviewBox.style.width = `${width}px`;
        ui.settingsCapturePreviewBox.style.height = `${height}px`;
        ui.settingsCaptureTextPreview.style.left = `${posX}%`;
        ui.settingsCaptureTextPreview.style.top = `${posY}%`;
    }

    // --- Translations ---
    async function loadAndApplySettingsTranslations(lang) {
        try {
            const translations = await window.electronAPI.loadSettingsTranslation(lang);
            if (!translations) return;

            currentTranslations = translations;

            document.querySelectorAll("[data-lang]").forEach(el => {
                const key = el.getAttribute("data-lang");
                if (translations[key]) {
                    el.innerHTML = translations[key];
                }
            });

            if (ui.languageButtons) {
                ui.languageButtons.forEach(btn => {
                    btn.classList.toggle('active', btn.getAttribute('data-lang') === lang);
                });
            }

            if (ui.minimizeBtn && translations.tooltipMinimize) ui.minimizeBtn.title = translations.tooltipMinimize;
            if (ui.maximizeBtn && translations.tooltipMaximize) ui.maximizeBtn.title = translations.tooltipMaximize;
            if (ui.closeBtn && translations.tooltipClose) ui.closeBtn.title = translations.tooltipClose;
            if (ui.versionDisplay && translations.versionPrefix && currentAppVersion) {
                ui.versionDisplay.textContent = `${translations.versionPrefix} ${currentAppVersion}`;
            }
            document.title = translations.settingsTitle || 'Settings';
        } catch (e) {
            console.error("Failed to apply settings translations:", e);
        }
    }

    // --- Main Logic ---
    if (window.electronAPI) {
        async function initialize() {
            try {
                    // Спрашиваем у main процесса, доступен ли OCR
                    const isOcrAvailable = await window.electronAPI.isOcrAvailable();
                    
                    // Находим все элементы, помеченные как ocr-feature
                    const ocrFeatureElements = document.querySelectorAll('.ocr-feature');

                    // Если OCR недоступен (это lite-версия), прячем эти элементы
                    if (!isOcrAvailable) {
                        ocrFeatureElements.forEach(el => {
                            el.style.display = 'none';
                        });
                    }
                } catch (e) {
                    console.error("Failed to check OCR availability in settings:", e);
                }
            try {
                const [appName, appVersion, settings] = await Promise.all([
                    window.electronAPI.getAppName(),
                    window.electronAPI.getAppVersion(),
                    window.electronAPI.getSettings()
                ]);

                currentAppVersion = appVersion;
                if (ui.appNameDisplay) ui.appNameDisplay.textContent = appName;

                if (settings) {
                    if (ui.prefixInput) ui.prefixInput.value = settings.prefix || 'W';
                    if (ui.maxDigitsInput) ui.maxDigitsInput.value = settings.max_digits || 5;
                    if (ui.includeRevisionCheckbox) ui.includeRevisionCheckbox.checked = settings.include_revision || false;
                    if (ui.themeSelect) ui.themeSelect.value = settings.theme || 'dark';
                    if (ui.pdfViewerModeSelect) ui.pdfViewerModeSelect.value = settings.pdf_viewer_mode || 'builtin';
                    if (ui.latestRevisionCheckbox) ui.latestRevisionCheckbox.checked = settings.process_latest_revision || false;
                    if (ui.removeDuplicatesCheckbox) ui.removeDuplicatesCheckbox.checked = settings.remove_duplicates || false;
                    if (ui.useOcrCheckbox) ui.useOcrCheckbox.checked = settings.use_ocr || false;
                    if (ui.screenshotWidthInput) ui.screenshotWidthInput.value = settings.screenshot_width || 200;
                    if (ui.screenshotHeightInput) ui.screenshotHeightInput.value = settings.screenshot_height || 68;

                    if (ui.textPosXSlider) {
                        const posX = settings.text_pos_x || 50;
                        ui.textPosXSlider.value = posX;
                        if (ui.textPosXValue) ui.textPosXValue.textContent = posX;
                    }
                    if (ui.textPosYSlider) {
                        const posY = settings.text_pos_y || 50;
                        ui.textPosYSlider.value = posY;
                        if (ui.textPosYValue) ui.textPosYValue.textContent = posY;
                    }

                    // Масштаб главного окна
                    if (ui.uiScaleMain) {
                        ui.uiScaleMain.value = settings.uiScale || 0.88;
                        ui.uiScaleMainValue.textContent = settings.uiScale || 0.88;
                    }

                    // Масштаб окна настроек
                    if (ui.uiScaleSettings) {
                        const scale = settings.settingsUiScale || 0.88;
                        ui.uiScaleSettings.value = scale;
                        ui.uiScaleSettingsValue.textContent = scale;
                        if (window.electronAPI?.setZoomFactor) {
                            window.electronAPI.setZoomFactor(parseFloat(scale));
                        }
                    }

                    updateCapturePreviewForSettings();
                }

                await loadAndApplySettingsTranslations(settings?.language || "en");

                window.electronAPI.onSettingsUpdated(async (updatedSettings) => {
                    console.log("Settings window received language update →", updatedSettings.language);
                    await loadAndApplySettingsTranslations(updatedSettings.language);
                    // ✅ теперь перевод уже загружен, можно брать строку
                    if (currentTranslations && currentTranslations.settingsUpdated) {
                        showNotification(currentTranslations.settingsUpdated);
                    }
                });

                // --- Controls to update preview ---
                const controlsToUpdatePreview = [
                    ui.screenshotWidthInput,
                    ui.screenshotHeightInput,
                    ui.textPosXSlider,
                    ui.textPosYSlider
                ];
                controlsToUpdatePreview.forEach(control => {
                    if (control) {
                        control.addEventListener('input', updateCapturePreviewForSettings);
                    }
                });

                // --- UI Scale sliders ---
                if (ui.uiScaleMain) {
                    ui.uiScaleMain.addEventListener('input', () => {
                        ui.uiScaleMainValue.textContent = ui.uiScaleMain.value;
                    });
                }
                if (ui.uiScaleSettings) {
                    ui.uiScaleSettings.addEventListener('input', () => {
                        const val = ui.uiScaleSettings.value;
                        ui.uiScaleSettingsValue.textContent = val;
                        if (window.electronAPI?.setZoomFactor) {
                            window.electronAPI.setZoomFactor(parseFloat(val));
                        }
                    });
                }

            } catch (error) {
                console.error('Initialization error:', error);
            }
        }

        // --- Language Buttons ---
        if (ui.languageButtons) {
            ui.languageButtons.forEach(button => {
                button.addEventListener('click', async (e) => {
                    e.preventDefault();
                    const newLang = button.getAttribute('data-lang');
                    if (newLang) {
                        await loadAndApplySettingsTranslations(newLang);
                        await window.electronAPI.saveSettings({ language: newLang });
                    }
                });
            });
        }

        await initialize();

        // ИСПРАВЛЕНО: Вся логика для слайдеров и инпутов теперь в одном месте
        [ui.screenshotWidthInput, ui.screenshotHeightInput, ui.textPosXSlider, ui.textPosYSlider]
        .forEach(control => {
            if (control) {
                control.addEventListener('input', () => {
                    // Эта функция обновляет визуальное превью
                    updateCapturePreviewForSettings();

                    // Дополнительная логика для обновления текстовых меток процентов
                    if (control === ui.textPosXSlider && ui.textPosXValue) {
                        ui.textPosXValue.textContent = control.value;
                    }
                    if (control === ui.textPosYSlider && ui.textPosYValue) {
                        ui.textPosYValue.textContent = control.value;
                    }
                });
            }
        });


        if (ui.saveBtn) {
            ui.saveBtn.addEventListener('click', async () => {
                try {
                    const currentSettings = await window.electronAPI.getSettings();

                    const max_digits = parseInt(ui.maxDigitsInput.value, 10);
                    const screenshot_width = parseInt(ui.screenshotWidthInput.value, 10);
                    const screenshot_height = parseInt(ui.screenshotHeightInput.value, 10);

                    const newSettings = {
                        ...currentSettings,
                        prefix: ui.prefixInput.value,
                        max_digits: parseInt(ui.maxDigitsInput.value, 10),
                        include_revision: ui.includeRevisionCheckbox.checked,
                        theme: ui.themeSelect.value,
                        pdf_viewer_mode: ui.pdfViewerModeSelect.value,
                        process_latest_revision: ui.latestRevisionCheckbox.checked,
                        remove_duplicates: ui.removeDuplicatesCheckbox.checked,
                        use_ocr: ui.useOcrCheckbox.checked,
                        screenshot_width: parseInt(ui.screenshotWidthInput.value, 10),
                        screenshot_height: parseInt(ui.screenshotHeightInput.value, 10),
                        text_pos_x: parseInt(ui.textPosXSlider.value, 10),
                        text_pos_y: parseInt(ui.textPosYSlider.value, 10),
                        uiScale: parseFloat(ui.uiScaleMain?.value) || 0.88,
                        settingsUiScale: parseFloat(ui.uiScaleSettings?.value) || 0.88,
                    };

                    await window.electronAPI.saveSettings(newSettings);
                    setTimeout(() => window.electronAPI.close(), 100);

                } catch (error) {
                    console.error('Failed to save settings:', error);
                }
            });
        }

        if (ui.cancelBtn) ui.cancelBtn.addEventListener('click', () => window.electronAPI.close());
        if (ui.closeBtn) ui.closeBtn.addEventListener('click', () => window.electronAPI.close());
        if (ui.minimizeBtn) ui.minimizeBtn.addEventListener('click', () => window.electronAPI.minimize());
        if (ui.maximizeBtn) ui.maximizeBtn.addEventListener('click', () => window.electronAPI.maximize());

        if (ui.updatesLink) {
            ui.updatesLink.addEventListener('click', (e) => {
                e.preventDefault();
                ui.updatesLink.textContent = currentTranslations.checkingForUpdates || 'Checking...';
                window.electronAPI.checkForUpdates();
            });
        }
    } else {
        console.warn('Electron API not found. Running in browser mode.');
    }
});

