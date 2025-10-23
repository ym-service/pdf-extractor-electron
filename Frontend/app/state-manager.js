// state-manager.js
// Управляет состоянием приложения в едином, предсказуемом месте.

let state = {
    capturedImages: [],
    allUploadedFiles: [],
    currentTranslations: {},
    currentFileForExport: null,
    analysisCompleted: false,
    isMaximized: false,
    theme: 'light',
    language: 'en',

    // 🟢 Новый блок: дефолтные настройки
    currentSettings: {
        prefix: 'W',
        max_digits: 5,
        include_revision: false,
        process_latest_revision: false,
        remove_duplicates: false,
        use_ocr: false,
        screenshot_width: 200,
        screenshot_height: 68,
        text_pos_x: 50,
        text_pos_y: 50,
        pdf_viewer_mode: 'builtin' // значение по умолчанию
    }
};

export const getState = () => state;

export const setState = (updates) => {
    state = { ...state, ...updates };
    console.log('[State Manager] State updated:', state); // Глобальный лог обновления состояния
};

// --- Геттеры/сеттеры ---
export const setCapturedImages = (images) => setState({ capturedImages: images });
export const setAllUploadedFiles = (files) => {
    console.log('[State Manager] Setting all uploaded files. Count:', files.length);
    setState({ allUploadedFiles: files });
};
export const addUploadedFiles = (newFiles) => {
    console.log(`[State Manager] Attempting to add ${newFiles.length} new file(s).`);
    const uniqueFiles = newFiles.filter(newFile => {
        const isDuplicate = state.allUploadedFiles.some(existingFile =>
            existingFile.path === newFile.path || existingFile.name === newFile.name
        );
        if (isDuplicate) {
            console.log(`[State Manager] File skipped (duplicate): ${newFile.name}, existing path: ${existingFile.path}, new path: ${newFile.path}`);
        }
        return !isDuplicate;
    });

    if (uniqueFiles.length > 0) {
        console.log(`[State Manager] Adding ${uniqueFiles.length} unique file(s) to state.`);
        setState({ allUploadedFiles: [...state.allUploadedFiles, ...uniqueFiles] });
    } else {
        console.log('[State Manager] No unique files to add.');
    }
    return uniqueFiles.length;
};
export const removeUploadedFile = (index) => {
    const updatedFiles = state.allUploadedFiles.filter((_, i) => i !== index);
    setState({ allUploadedFiles: updatedFiles });
};
export const setCurrentFileForExport = (file) => setState({ currentFileForExport: file });
export const setAnalysisCompleted = (status) => setState({ analysisCompleted: status });
export const toggleMaximized = () => setState({ isMaximized: !state.isMaximized });
export const setTheme = (theme) => setState({ theme });
export const setLanguageState = (lang) => setState({ language: lang });
export const setTranslations = (translations) => setState({ currentTranslations: translations });

// 🟢 Дополнительно сеттер для настроек
export const setCurrentSettings = (settings) => setState({ currentSettings: settings });

export const findFileByPath = (path) => state.allUploadedFiles.find(f => f.path === path);
