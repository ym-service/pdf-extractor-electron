import { dom } from './dom-elements.js';
import { getState, setState, setCurrentSettings } from './state-manager.js';
import { handleFiles, renderFileList, clearFileListUI } from './file-and-ui.js';
import { runAnalysis, handleBulkExport, handleSingleFileExport } from './analysis-and-export.js';
import { openPdfViewer, closePdfViewer, openHelpModal, closeHelpModal, closeExportModal, openExportModal } from './modals.js';
import { updateCapturePreview, updateThemeIcons, toast, isReallyMaximized, updateMaximizeIcon } from './ui-helpers.js';
import { setLanguage } from './i18n.js';

export const setupEventListeners = () => {
    // ИСПРАВЛЕНО: Добавлены все нужные элементы из боковой панели для консистентности
    const {
        generateReportBtn,
        exportTxtBtn,
        exportCsvBtn,
        addFilesBtn,
        pdfUpload,
        fileDropContainer,
        fileFilterInput,
        runAnalysisBtn,
        clearFilesBtn,
        backToMainBtn,
        viewResultsBtn,
        closeViewerBtn,
        helpBtn,
        closeHelpBtn,
        helpModal,
        fileExportModal,
        closeExportModalBtn,
        exportFilePdfBtn,
        exportFileTxtBtn,
        exportFileCsvBtn,
        themeToggleBtn,
        langSwitcher,
        minimizeBtn,
        maximizeBtn,
        closeBtn,
        settingsBtn,
        
        // Элементы боковой панели для синхронизации
        prefixInput,
        captureWidthInput,
        captureHeightInput,
        positionXInput,
        positionYInput,
        includeRevisionCheckbox,
        filterRevisionsCheckbox,
        filterCsvDuplicatesCheckbox,
        useOcrCheckbox,
        // ИСПРАВЛЕНО: Добавлены метки для процентов
        positionXLabel,
        positionYLabel
    } = dom;

    // --- Language switcher ---
    // Эта логика верна: отправляем команду на сохранение, ждем ответа.
    if (langSwitcher) {
        langSwitcher.addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-lang-code]');
            if (!btn) return;
            const newLang = btn.dataset.langCode;
            if (newLang && newLang !== getState().currentSettings?.language) {
                await window.electronAPI.saveSettings({ language: newLang });
            }
        });
    }

    // --- Theme toggle ---
    // Эта логика верна: отправляем команду на сохранение, ждем ответа.
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', async () => {
            const currentTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            await window.electronAPI.saveSettings({ theme: newTheme });
        });
    }

    // --- Electron API Listeners ---
    if (window.electronAPI) {
        // ИСПРАВЛЕНО: Полная и корректная синхронизация ВСЕХ настроек
        window.electronAPI.onSettingsUpdated((settings) => {
            console.log('Главное окно получило команду на обновление настроек:', settings);
            
            setCurrentSettings(settings);

            if (settings.language) {
                setLanguage(settings.language);
            }

            if (settings.theme) {
                const isDark = settings.theme === 'dark';
                document.documentElement.classList.toggle('dark', isDark);
                updateThemeIcons(isDark);
            }

            // Синхронизируем остальные настройки с боковой панелью главного окна
            if (prefixInput) prefixInput.value = settings.prefix || 'W';
            if (filterRevisionsCheckbox) filterRevisionsCheckbox.checked = !!settings.process_latest_revision;
            if (includeRevisionCheckbox) includeRevisionCheckbox.checked = !!settings.include_revision;
            if (filterCsvDuplicatesCheckbox) filterCsvDuplicatesCheckbox.checked = !!settings.remove_duplicates;
            if (useOcrCheckbox) useOcrCheckbox.checked = !!settings.use_ocr;

            // Синхронизируем настройки скриншота
            if (captureWidthInput) captureWidthInput.value = settings.screenshot_width || 200;
            if (captureHeightInput) captureHeightInput.value = settings.screenshot_height || 68;
            if (positionXInput) positionXInput.value = settings.text_pos_x || 50;
            if (positionYInput) positionYInput.value = settings.text_pos_y || 50;
            
            updateCapturePreview();
            // ✅ показываем тост на следующем кадре, чтобы успел обновиться переводчик
            requestAnimationFrame(() => toast('settingsUpdated'));
        });

        // Остальные обработчики событий окна
        if (minimizeBtn) minimizeBtn.addEventListener('click', () => window.electronAPI.minimize());
        if (maximizeBtn) maximizeBtn.addEventListener('click', () => window.electronAPI.maximize());
        if (closeBtn) closeBtn.addEventListener('click', () => window.electronAPI.close());
        if (settingsBtn) settingsBtn.addEventListener('click', () => window.electronAPI.openSettingsWindow());

        window.electronAPI.onWindowStateChange((isMaximized) => {
            setState({ isMaximized });
            updateMaximizeIcon(isMaximized);
        });
    }


    // --- ВСЯ ВАША ОСТАЛЬНАЯ ЛОГИКА ОСТАЛАСЬ БЕЗ ИЗМЕНЕНИЙ ---

    // --- Экспорт кнопок ---
    if (generateReportBtn) generateReportBtn.addEventListener('click', () => handleBulkExport('pdf'));
    if (exportTxtBtn) exportTxtBtn.addEventListener('click', () => handleBulkExport('txt'));
    if (exportCsvBtn) exportCsvBtn.addEventListener('click', () => handleBulkExport('csv'));

    // --- Drag & Drop / Click в зону ---
    if (fileDropContainer) {
        fileDropContainer.addEventListener('click', async () => {
            const { allUploadedFiles } = getState();
            if (allUploadedFiles.length === 0) {
                if (window.electronAPI?.showOpenDialog) {
                    try {
                        const res = await window.electronAPI.showOpenDialog();
                        if (res?.canceled) {
                            console.log("Диалог выбора файлов отменен пользователем.");
                            return;
                        }
                        if (Array.isArray(res?.filePaths) && res.filePaths.length > 0) {
                            handleFiles(res.filePaths);
                            return;
                        }
                    } catch (err) {
                        console.error("Ошибка открытия диалога выбора файлов:", err);
                    }
                }
                if (pdfUpload) pdfUpload.click();
            }
        });

        fileDropContainer.addEventListener('keydown', async e => {
            const { allUploadedFiles } = getState();
            if ((e.key === 'Enter' || e.key === ' ') && allUploadedFiles.length === 0) {
                if (window.electronAPI?.showOpenDialog) {
                    try {
                        const res = await window.electronAPI.showOpenDialog();
                        if (Array.isArray(res?.filePaths) && res.filePaths.length) {
                            handleFiles(res.filePaths);
                            return;
                        }
                    } catch {}
                }
                if (pdfUpload) pdfUpload.click();
            }
        });

        fileDropContainer.addEventListener('dragover', e => {
            e.preventDefault();
            fileDropContainer.classList.add('border-blue-500', 'bg-gray-50', 'dark:bg-gray-700');
        });

        fileDropContainer.addEventListener('dragleave', () => {
            fileDropContainer.classList.remove('border-blue-500', 'bg-gray-50', 'dark:bg-gray-700');
        });

        fileDropContainer.addEventListener('drop', e => {
            e.preventDefault();
            fileDropContainer.classList.remove('border-blue-500', 'bg-gray-50', 'dark:bg-gray-700');
            if (e.dataTransfer && e.dataTransfer.files.length > 0) {
                handleFiles(e.dataTransfer.files);
            }
        });
    }

    // --- File input ---
    if (pdfUpload) {
        pdfUpload.addEventListener('change', e => {
            if (e.target.files && e.target.files.length > 0) {
                handleFiles(e.target.files);
            }
        });
    }
    
    // --- Фильтры ---
    if (fileFilterInput) fileFilterInput.addEventListener('input', renderFileList);
    if (filterRevisionsCheckbox) filterRevisionsCheckbox.addEventListener('change', renderFileList);

    // --- Кнопки анализа/очистки ---
    if (runAnalysisBtn) runAnalysisBtn.addEventListener('click', runAnalysis);
    if (clearFilesBtn) clearFilesBtn.addEventListener('click', clearFileListUI);
    if (addFilesBtn) {
        addFilesBtn.addEventListener('click', async () => {
            if (window.electronAPI?.showOpenDialog) {
                try {
                    const res = await window.electronAPI.showOpenDialog();
                    if (res?.canceled) {
                        return;
                    }
                    if (Array.isArray(res?.filePaths) && res.filePaths.length) {
                        handleFiles(res.filePaths);
                        return;
                    }
                } catch (err) {
                    console.error("Ошибка при открытии диалога добавления файлов:", err);
                }
            }
            if (pdfUpload) pdfUpload.click();
        });
    }

    // --- Переключение секций ---
    if (backToMainBtn) backToMainBtn.addEventListener('click', () => {
        const { mainSection, resultsSection } = dom;
        resultsSection.classList.add('hidden');
        mainSection.classList.remove('hidden');
    });

    if (viewResultsBtn) viewResultsBtn.addEventListener('click', () => {
        const { analysisCompleted } = getState();
        const { mainSection, resultsSection } = dom;
        if (analysisCompleted) {
            mainSection.classList.add('hidden');
            resultsSection.classList.remove('hidden');
        }
    });

    // --- Настройки скриншотов ---
    // ИСПРАВЛЕНО: Теперь этот блок обновляет и проценты.
    const settingsInputs = [prefixInput, captureWidthInput, captureHeightInput, positionXInput, positionYInput, includeRevisionCheckbox, filterRevisionsCheckbox, filterCsvDuplicatesCheckbox, useOcrCheckbox];
    settingsInputs.forEach(el => {
        if (el) {
            const eventType = el.type === 'checkbox' ? 'change' : 'input';
            el.addEventListener(eventType, async () => {
                // Сохраняем все настройки при любом изменении
                const settingsToSave = {};
                if (prefixInput) settingsToSave.prefix = prefixInput.value;
                if (captureWidthInput) settingsToSave.screenshot_width = parseInt(captureWidthInput.value, 10);
                if (captureHeightInput) settingsToSave.screenshot_height = parseInt(captureHeightInput.value, 10);
                if (positionXInput) settingsToSave.text_pos_x = parseInt(positionXInput.value, 10);
                if (positionYInput) settingsToSave.text_pos_y = parseInt(positionYInput.value, 10);
                if (includeRevisionCheckbox) settingsToSave.include_revision = includeRevisionCheckbox.checked;
                if (filterRevisionsCheckbox) settingsToSave.process_latest_revision = filterRevisionsCheckbox.checked;
                if (filterCsvDuplicatesCheckbox) settingsToSave.remove_duplicates = filterCsvDuplicatesCheckbox.checked;
                if (useOcrCheckbox) settingsToSave.use_ocr = useOcrCheckbox.checked;

                await window.electronAPI.saveSettings(settingsToSave);

                // Обновляем UI немедленно
                updateCapturePreview(); 
            });
        }
    });
    
    // Добавляем отдельные слушатели для обновления только текстовых меток процентов
    if (positionXInput && positionXLabel) {
        positionXInput.addEventListener('input', () => {
            positionXLabel.textContent = positionXInput.value;
        });
    }
    if (positionYInput && positionYLabel) {
        positionYInput.addEventListener('input', () => {
            positionYLabel.textContent = positionYInput.value;
        });
    }


    // --- Viewer / Help ---
    if (closeViewerBtn) closeViewerBtn.addEventListener('click', closePdfViewer);
    if (helpBtn) helpBtn.addEventListener('click', openHelpModal);
    if (closeHelpBtn) closeHelpBtn.addEventListener('click', closeHelpModal);
    if (helpModal) {
        helpModal.addEventListener('click', (e) => {
            if (e.target === helpModal) closeHelpModal();
        });
    }

    // --- Export modal ---
    if (fileExportModal) {
        if (closeExportModalBtn) closeExportModalBtn.addEventListener('click', closeExportModal);
        fileExportModal.addEventListener('click', (e) => {
            if (e.target === fileExportModal) closeExportModal();
        });
        if (exportFilePdfBtn) exportFilePdfBtn.addEventListener('click', () => handleSingleFileExport('pdf'));
        if (exportFileTxtBtn) exportFileTxtBtn.addEventListener('click', () => handleSingleFileExport('txt'));
        if (exportFileCsvBtn) exportFileCsvBtn.addEventListener('click', () => handleSingleFileExport('csv'));
    }

    // --- Resize listener ---
    window.addEventListener('resize', () => {
        const now = isReallyMaximized();
        const isMaximized = getState().isMaximized;
        if (now !== isMaximized) {
            setState({ isMaximized: now });
            updateMaximizeIcon(now);
        }
    });
};

