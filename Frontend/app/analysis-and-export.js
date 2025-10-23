// analysis-and-export.js
// Модуль для логики анализа, отображения результатов и экспорта.
import { dom } from './dom-elements.js';
import { getState, setState } from './state-manager.js';
import { openPdfViewer, openExportModal, closeExportModal } from './modals.js';
import { toast } from './ui-helpers.js';
import { renderFileList, updateTotalMatchCount, updateFileCount } from './file-and-ui.js'; // <<< добавлен updateFileCount
import { setCapturedImages } from './state-manager.js';
import { t } from './i18n.js';

// Вспомогательные функции
const getBaseNumberRegex = () => {
    const { prefixInput } = dom;
    const MAX_DIGITS_AFTER_PREFIX = 5;
    const prefix = (prefixInput?.value || 'W');
    const esc = prefix.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    return new RegExp(`^${esc}(\\d{1,${MAX_DIGITS_AFTER_PREFIX}})(?!\\d)`);
};

// Единообразные ключи опций (совместимые с runAnalysis)
const buildBackendOptions = () => {
    const {
        prefixInput,
        includeRevisionCheckbox,
        filterCsvDuplicatesCheckbox,
        filterRevisionsCheckbox,
        captureWidthInput,
        captureHeightInput,
        positionXInput,
        positionYInput,
        useOcrCheckbox
    } = dom;
    const MAX_DIGITS_AFTER_PREFIX = 5;
    return {
        prefix: prefixInput?.value.trim() || 'W',
        max_digits: MAX_DIGITS_AFTER_PREFIX,
        include_revision: !!includeRevisionCheckbox?.checked,
        process_latest_revision: !!filterRevisionsCheckbox?.checked,
        remove_duplicates: !!filterCsvDuplicatesCheckbox?.checked,
        use_ocr: !!useOcrCheckbox?.checked,
        screenshot_width: +(captureWidthInput?.value || 200),
        screenshot_height: +(captureHeightInput?.value || 88),
        text_pos_x: +(positionXInput?.value || 50),
        text_pos_y: +(positionYInput?.value || 50)
    };
};

// ВАЖНО: учитываем источник файла + поддержка OCR
const adaptBackendItemToCaptured = (item, sourceFile) => {
    return {
        dataUrl: item.image_png_b64 || '', // OCR может быть пусто
        gridCoord: item.grid || '',        // OCR может быть пусто
        text: item.text || '',
        composite_number: item.composite_number || item.text || '',
        page: item.page || 0,
        grid: item.grid || '',
        image_png_b64: item.image_png_b64 || '',
        revision: typeof item.revision === 'number' ? item.revision : null,
        comment: item.comment || '',
        sourceFile: item.sourceFile || sourceFile || { name: '', path: '' },
        filePrefix: item.filePrefix,
        excluded: false,
        // Новый флаг для UI — элемент из OCR (нет скрина)
        isOcr: !item.image_png_b64
    };
};

const makeItemKey = (it) => {
    const t0 = String(it?.text ?? '');
    const p = String(it?.page ?? '');
    const g = String(it?.grid ?? it?.gridCoord ?? '');
    const fn = String(it?.sourceFile?.name ?? it?.sourceFileName ?? '');
    return `${t0}|p${p}|g${g}|f${fn}`;
};

const mergeAnalyzedItems = (existing, incoming) => {
    const out = existing ? existing.slice() : [];
    const seen = new Set(out.map(makeItemKey));
    for (const it of incoming || []) {
        const k = makeItemKey(it);
        if (!seen.has(k)) { out.push(it); seen.add(k); }
    }
    return out;
};

// Карточка результата (с поддержкой OCR и плашкой)
const createResultCard = (imgData, index) => {
    const div = document.createElement('div');
    div.className = `result-item flex flex-col md:flex-row items-center gap-4 p-2 border-b dark:border-gray-700 ${imgData.excluded ? 'excluded' : ''}`;

    const prev = document.createElement('div');
    prev.className = 'relative border dark:border-gray-700 rounded-lg p-2 shadow-sm bg-gray-50 dark:bg-gray-900/50 flex flex-col items-center group w-full md:w-1/3';

    const numberSpan = document.createElement('span');
    numberSpan.textContent = `${index + 1}.`;
    numberSpan.className = 'absolute top-2 left-2 text-xs font-bold text-gray-500 dark:text-gray-400';

    const excludeBtn = document.createElement('button');
    excludeBtn.type = 'button';
    excludeBtn.innerHTML = '&times;';
    excludeBtn.className = 'exclude-btn absolute top-1 right-1 text-xl font-bold text-red-500 hover:text-red-700 bg-white/50 dark:bg-gray-800/50 rounded-full h-6 w-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity';
    excludeBtn.onclick = (e) => { e.stopPropagation(); toggleExclude(index, div); };

    const imgWrap = document.createElement('div');
    imgWrap.className = 'cursor-pointer';
    imgWrap.onclick = () => {
        if (imgData.sourceFile?.path) {
            openPdfViewer(imgData.sourceFile, imgData.page);
        } else {
            console.error("Missing file path for PDF viewer:", imgData);
        }
    };

    const img = document.createElement('img');
    if (imgData.dataUrl) {
        img.src = imgData.dataUrl;
        img.alt = `Screenshot of ${imgData.text}`;
    } else {
        // OCR fallback: заглушка
        img.src = 'data:image/svg+xml;base64,' + btoa(
            `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60">
                <rect width="100%" height="100%" fill="#ddd"/>
                <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="14" fill="#555">OCR</text>
            </svg>`
        );
        img.alt = `OCR text: ${imgData.text}`;
    }
    img.className = 'rounded-md border border-gray-200 dark:border-gray-700 mb-2';
    imgWrap.append(img);

    const p = document.createElement('p');
    p.className = 'text-sm font-bold break-all text-center text-blue-600 cursor-pointer hover:underline';
    p.textContent = imgData.composite_number || imgData.text;
    p.onclick = () => {
        if (imgData.sourceFile?.path) {
            openPdfViewer(imgData.sourceFile, imgData.page);
        }
    };

    const details = document.createElement('p');
    details.className = 'text-xs text-gray-500 dark:text-gray-400';
    let d = `(p${imgData.page}, ${imgData.gridCoord || 'no-grid'})`;
    if (imgData.revision !== null && imgData.revision > -1) {
        d = `(rev: ${String(imgData.revision).padStart(2,'0')}, p${imgData.page}, ${imgData.gridCoord || 'no-grid'})`;
    }
    details.textContent = d;

    // Новая плашка "OCR"
    if (imgData.isOcr) {
        const badge = document.createElement('span');
        badge.textContent = 'OCR';
        badge.className = 'absolute bottom-2 right-2 text-[10px] px-2 py-0.5 rounded-full bg-purple-600 text-white';
        prev.appendChild(badge);
    }

    prev.append(numberSpan, excludeBtn, imgWrap, p, details);

    const ta = document.createElement('textarea');
    ta.className = 'w-full md:w-2/3 h-24 p-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-blue-500 focus:border-blue-500';
    ta.placeholder = t('commentsPlaceholder') || 'Enter comments here...';
    ta.value = imgData.comment || '';
    ta.oninput = () => {
        const { capturedImages } = getState();
        const updatedImages = [...capturedImages];
        updatedImages[index].comment = ta.value;
        setState({ capturedImages: updatedImages });
    };

    div.append(prev, ta);
    return div;
};

const toggleExclude = (idx, el) => {
    const { capturedImages } = getState();
    const updatedImages = [...capturedImages];
    updatedImages[idx].excluded = !updatedImages[idx].excluded;
    setState({ capturedImages: updatedImages });
    el.classList.toggle('excluded');
    updateResultSummary();
};

const updateResultSummary = () => {
    const { capturedImages } = getState();
    const { resultSummary } = dom;

    if (!resultSummary) return;

    const active = capturedImages.filter(i => !i.excluded);
    if (capturedImages.length === 0) {
        resultSummary.textContent = t('noMatches');
        return;
    }
    const uniq = new Set(active.map(i => i.composite_number || i.text));
    resultSummary.textContent = t('foundMatches', { count: active.length, unique: uniq.size });
};

const buildExportPayload = (format, options, flatItems) => {
    const groups = new Map();
    for (const it of flatItems) {
        const filePath = it?.sourceFile?.path || it?.sourceFile?.name || 'unknown';
        if (!groups.has(filePath)) groups.set(filePath, []);
        groups.get(filePath).push({
            text: it.text,
            composite_number: it.composite_number || it.text,
            page: it.page,
            grid: it.grid || it.gridCoord || '',
            image_png_b64: it.image_png_b64 || '',
            revision: typeof it.revision === 'number' ? it.revision : null,
            comment: it.comment || '',
            sourceFile: { name: it?.sourceFile?.name || '', path: it?.sourceFile?.path || '' }
        });
    }
    const itemsByFile = Array.from(groups.entries()).map(([filePath, items]) => ({ filePath, items }));
    return { format, options, items: itemsByFile };
};

// Экспортируемые функции
export const parseFileName = (fileName) => {
    if (!fileName) return { baseName: '', revision: -1 };

    // Убираем расширение, как и раньше
    const nameWithoutExt = fileName.slice(0, fileName.lastIndexOf('.'));
    // Регулярное выражение отличное, оно находит _rЧИСЛО или _ЧИСЛО
    const revRegex = /_r?(\d+)/g;
    const allMatches = [...nameWithoutExt.matchAll(revRegex)];
    if (allMatches.length > 0) {
        // Берем последнее найденное совпадение, это правильно
        const last = allMatches[allMatches.length - 1];
        const revisionNumber = parseInt(last[1], 10);
        // --- ИЗМЕНЕНО ЗДЕСЬ ---
        // Просто берем часть строки ДО найденной ревизии
        const baseName = nameWithoutExt.substring(0, last.index)
            .replace(/^_|_$/g, ''); // Очистка от подчеркиваний по краям
        return { baseName: baseName.toLowerCase(), revision: revisionNumber };
    }
    // Для файлов без ревизии логика остается прежней
    return { baseName: nameWithoutExt.toLowerCase(), revision: -1 };
};

export const runPreliminaryAnalysis = async (file) => {
    const options = buildBackendOptions();
    try {
        if (!window.electronAPI) throw new Error('Electron API not found.');
        if (!file.path) throw new Error('File path is not available for preliminary analysis.');
        const result = await window.electronAPI.runAnalysis([file.path], options);
        if (!result.success) throw new Error(result.error || 'Unknown backend error');
        const fileResult = result.data.files[0];
        if (!fileResult || !Array.isArray(fileResult.items)) throw new Error('Invalid response structure');

        const items = fileResult.items.map(item => adaptBackendItemToCaptured(item, file));
        const re = getBaseNumberRegex();
        const filtered = items.filter(it => re.test(it.text));
        const uniqueTexts = new Set(filtered.map(it => (it.text.match(re) || [it.text])[0]));
        file.analysisResult = { total: filtered.length, unique: uniqueTexts.size, items: filtered, error: null };
    } catch (e) {
        console.error(`Analysis failed for ${file.name}:`, e);
        file.analysisResult = { total: 0, unique: 0, items: [], error: e.message };
    } finally {
        file.isAnalyzing = false;
        renderFileList();
    }
};


export const runAnalysis = async () => {
    const { currentSettings = {} } = getState();
    const { mainSection, processingSection, resultsSection, statusDisplay, viewResultsBtn } = dom;

    const activeEls = document.querySelectorAll('#file-list-content .file-item:not(.hidden):not(.filtered-out)');
    const filesToAnalyzePaths = Array.from(activeEls).map(el => el.dataset.path).filter(Boolean);

    if (filesToAnalyzePaths.length === 0) {
        toast('noFiles', {}, true);
        return;
    }

    mainSection.classList.add('hidden');
    resultsSection.classList.add('hidden');
    processingSection.classList.remove('hidden');
    statusDisplay.textContent = t('processing') || 'Processing...';

    try {
        const options = {
            prefix: currentSettings.prefix || 'W',
            max_digits: currentSettings.max_digits || 5,
            include_revision: currentSettings.include_revision || false,
            process_latest_revision: currentSettings.process_latest_revision || false,
            remove_duplicates: currentSettings.remove_duplicates || false,
            use_ocr: currentSettings.use_ocr || false,
            screenshot_width: currentSettings.screenshot_width || 200,
            screenshot_height: currentSettings.screenshot_height || 88,
            text_pos_x: currentSettings.text_pos_x || 30,
            text_pos_y: currentSettings.text_pos_y || 50
        };

        const result = await window.electronAPI.runAnalysis(filesToAnalyzePaths, options);

        if (!result.success) {
            throw new Error(result.error || 'An unknown error occurred during analysis.');
        }

        let images = [];
        if (result.data && Array.isArray(result.data.files)) {
            images = result.data.files.flatMap(file =>
                (file.items || []).map(item => adaptBackendItemToCaptured(item, file))
            );
        }

        setState({
            capturedImages: images,
            analysisCompleted: true
        });

        processingSection.classList.add('hidden');
        resultsSection.classList.remove('hidden');
        displayResults();

        if (viewResultsBtn) viewResultsBtn.classList.remove('hidden');

    } catch (error) {
        console.error('Analysis failed:', error);
        toast(error.message, true);

        processingSection.classList.add('hidden');
        mainSection.classList.remove('hidden');
        resultsSection.classList.add('hidden');
    }
};

export const displayResults = () => {
    const { capturedImages } = getState();
    const { imageResults, resultSummary } = dom;

    if (!imageResults || !resultSummary) {
        console.error('imageResults or resultSummary element not found in DOM');
        return;
    }

    imageResults.innerHTML = '';

    if (!Array.isArray(capturedImages) || capturedImages.length === 0) {
        imageResults.innerHTML = `<p class="text-center text-gray-400 py-8">${t('noMatches')}</p>`;
        resultSummary.textContent = '';
        updateFileCount();                // <<< обновляем количество файлов
        updateTotalMatchCount(0);         // <<< совпадений нет
        return;
    }

    capturedImages.forEach((imgData, idx) => {
        const card = createResultCard(imgData, idx);
        imageResults.appendChild(card);
    });

    updateResultSummary();
    updateFileCount();                    // <<< обновляем количество файлов
    updateTotalMatchCount(capturedImages.length); // <<< совпадений = длина массива
};

export const handleExport = async (format, flatItems) => {
    const active = (flatItems || []).filter(Boolean);
    if (active.length === 0 || !window.electronAPI?.exportReport) {
        toast('noItemsToExport', {}, true);
        return;
    }
    try {
        const payload = buildExportPayload(format, buildBackendOptions(), active);
        await window.electronAPI.exportReport(payload);
    } catch (e) {
        console.error(`Export to ${format} failed:`, e);
        toast(`Export failed: ${e.message}`, true);
    }
};

export const handleSingleFileExport = (format) => {
    const { currentFileForExport } = getState();
    if (!currentFileForExport) return;
    const items = (currentFileForExport.analysisResult?.items || []).filter(i => !i.excluded);
    handleExport(format, items).finally(closeExportModal);
};

export const handleBulkExport = (format) => {
    const { capturedImages } = getState();
    handleExport(format, capturedImages.filter(i => !i.excluded));
};
