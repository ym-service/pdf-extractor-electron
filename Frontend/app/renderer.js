// renderer.js - Главный модуль, запускающий приложение.
import { dom } from './dom-elements.js';
import { setState, getState, setAnalysisCompleted, toggleMaximized, setAllUploadedFiles, setCurrentSettings } from './state-manager.js';
import { updateMaximizeIcon, isReallyMaximized, updateCapturePreview, toast, ensureWindowControlIcons, updateThemeIcons } from './ui-helpers.js';
import { setLanguage } from './i18n.js';
import { renderFileList, handleFiles, updateFileCount, updateTotalMatchCount } from './file-and-ui.js';
import { runAnalysis, displayResults } from './analysis-and-export.js';
import { closePdfViewer, closeHelpModal, closeExportModal, openExportModal, openPdfViewer } from './modals.js';
import { setupEventListeners } from './event-listeners.js';

// Универсальная функция для получения элемента по ID.
const $ = (id) => document.getElementById(id);

// --- ИЗМЕНЕНО ---
// Новая централизованная функция для применения всех настроек к UI.
/**
 * Применяет полученный объект настроек ко всем элементам UI.
 * @param {object} settings - Объект настроек из главного процесса.
 */
function applySettings(settings) {
    if (!settings) return;

    // Сохраняем настройки в state-manager
    setCurrentSettings(settings);

    // Применяем тему
    if (settings.theme) {
        const isDark = settings.theme === 'dark';
        document.documentElement.classList.toggle('dark', isDark);
        updateThemeIcons(isDark);
    }
    
    // --- ИСПРАВЛЕНИЕ ДЛЯ ГАЛОЧЕК ---
    // Вставьте сюда реальные ID ваших чекбоксов и ключи настроек.
    // Пример:
    const processLatestCheckbox = document.querySelector('#process-latest-revision-checkbox');
    if (processLatestCheckbox) {
        processLatestCheckbox.checked = !!settings.process_latest_revision;
    }

    const removeDuplicatesCheckbox = document.querySelector('#remove-duplicates-checkbox');
    if (removeDuplicatesCheckbox) {
        removeDuplicatesCheckbox.checked = !!settings.remove_duplicates;
    }
    
    const useOcrCheckbox = document.querySelector('#use-ocr-checkbox');
    if (useOcrCheckbox) {
        useOcrCheckbox.checked = !!settings.use_ocr;
    }
    // Добавьте сюда другие галочки и элементы настроек по аналогии...
}

// ------- Init -------
const initializeApp = async () => {
    // Обновление информации в подвале
    if (window.electronAPI) {
        try {
            const appNameElement = $('footer-app-name');
            const appVersionElement = $('footer-app-version');
            if (appNameElement) appNameElement.textContent = await window.electronAPI.getAppName();
            if (appVersionElement) appVersionElement.textContent = await window.electronAPI.getAppVersion();
        } catch (err) {
            console.error("Не удалось получить информацию о приложении для подвала:", err);
        }
    }

    // jsPDF safe init
    try {
        if (window.jspdf && window.jspdf.jsPDF) window.jsPDF = window.jspdf.jsPDF;
    } catch {}

    // Размер кнопок заголовка под масштабом
    (async () => {
        try {
            const f = (window.uiScale && typeof window.uiScale.get === 'function') ? await window.uiScale.get() : 0.88;
            const style = document.createElement('style');
            style.id = 'ui-scale-style';
            style.textContent = `
                :root { --ui-zoom:${f}; }
                #title-bar{ height: calc(32px / var(--ui-zoom)); }
                #title-bar { z-index: 20000; }
                .window-controls{ height: calc(32px / var(--ui-zoom)); }
                .window-control-btn{ width: calc(50px / var(--ui-zoom)); height: 100%; }
            `;
            document.head.appendChild(style);
        } catch {}
    })();

    // --- ИЗМЕНЕНО ---
    // Старый блок загрузки настроек полностью удален отсюда.
    // Настройки теперь загружаются через слушателя событий ниже.

    // Установка языка по умолчанию. Он будет изменен на правильный, как только придут настройки.
    await setLanguage('en', false);

    // Инициализация UI
    ensureWindowControlIcons();
    setState({ isMaximized: isReallyMaximized() });
    updateMaximizeIcon(getState().isMaximized);
    updateCapturePreview();

    renderFileList();
    updateFileCount(0);
    updateTotalMatchCount(0);

    setupEventListeners();

    const isDarkAfterInit = document.documentElement.classList.contains('dark');
    updateThemeIcons(isDarkAfterInit);
};


// --- ИЗМЕНЕНО ---
// Добавляем слушателя событий на верхнем уровне.
// Он сработает при запуске и при каждом изменении настроек.
if (window.electronAPI) {
    window.electronAPI.onSettingsUpdated(async (settings) => {
        console.log('✅ Настройки получены из main процесса, применяем к UI:', settings);
        // Вызываем нашу новую функцию для обновления всего интерфейса
        applySettings(settings);
        // Устанавливаем язык после получения настроек
        await setLanguage(settings.language || 'en', false);
    });
}


// ------- Find Bar -------
(function initFindBar() {
    // ... (этот блок без изменений)
    if (!window.electronAPI) return;

    const find = {
        search: (txt, opts) => window.electronAPI.findSearch(txt, opts),
        stop: (action) => window.electronAPI.findStop(action),
        onShow: (cb) => window.electronAPI.onFindShow(cb)
    };

    const bar = document.createElement('div');
    bar.id = 'find-bar';
    bar.style.cssText = 'position:fixed; top:60px; left:10px; z-index:9999; display:none; gap:6px; align-items:center; background:rgba(159,170,189,.92); color:#1e3a8a; padding:6px 8px; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,.25)';
    bar.innerHTML = `
        <input id="find-input" type="text" placeholder="Find…" style="width:220px; padding:4px 6px; border-radius:4px; border:none; outline:none; color:#1e3a8a;" />
        <label style="display:flex;align-items:center;gap:4px;font-size:12px;opacity:.9; color:#1e3a8a">
        <input id="find-matchcase" type="checkbox" /> Aa
        </label>
        <button id="find-prev" title="Previous (Shift+Enter)" style="color:#1e3a8a">‹</button>
        <button id="find-next" title="Next (Enter)" style="color:#1e3a8a">›</button>
        <button id="find-close" title="Esc" style="color:#1e3a8a">✕</button>`;
    document.body.appendChild(bar);

    const input = bar.querySelector('#find-input');
    const matchCase = bar.querySelector('#find-matchcase');
    const btnPrev = bar.querySelector('#find-prev');
    const btnNext = bar.querySelector('#find-next');
    const btnClose = bar.querySelector('#find-close');

    function showBar(prefill = '') {
        bar.style.display = 'flex';
        if (prefill) input.value = prefill;
        setTimeout(() => input.focus({ preventScroll: true }), 0);
    }

    function hideBar() {
        bar.style.display = 'none';
        find.stop('clearSelection');
    }

    function search(forward = true, findNext = true) {
        const txt = input.value.trim();
        if (!txt) return;
        find.search(txt, { forward, findNext, matchCase: !!matchCase.checked });
    }

    find.onShow(() => showBar(''));

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            search(!e.shiftKey, true);
        } else if (e.key === 'Escape') {
            hideBar();
        }
    });

    btnNext.addEventListener('click', () => search(true, true));
    btnPrev.addEventListener('click', () => search(false, true));
    btnClose.addEventListener('click', hideBar);
})();

// ------- OCR Feature Availability Check -------
async function setupInterfaceForOcr() {
    // Вызываем функцию, которую мы только что создали в preload.js
    const isOcr = await window.electronAPI.isOcrAvailable();

    const ocrElements = document.querySelectorAll('.ocr-feature');

    if (!isOcr) {
        // Если OCR недоступен, прячем все связанные с ним элементы
        ocrElements.forEach(el => {
            el.style.display = 'none';
        });
        console.log("OCR is not available in this build. Hiding OCR features.");
    } else {
        console.log("OCR is available.");
    }
}

// Вызываем функцию при загрузке приложения
setupInterfaceForOcr();

// ------- DOMContentLoaded -------
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();

    // --- Find button ---
    const findBtn = document.getElementById('find-btn');
    if (findBtn) {
        findBtn.addEventListener('click', () => {
            const bar = document.getElementById('find-bar');
            if (bar) {
                bar.style.display = 'flex';
                bar.querySelector('#find-input')?.focus();
            }
        });
    }
});