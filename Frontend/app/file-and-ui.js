import { dom } from './dom-elements.js';
import { getState, setState } from './state-manager.js';
import { t } from './i18n.js';
import { openPdfViewer, openExportModal } from './modals.js';
import { runPreliminaryAnalysis, parseFileName } from './analysis-and-export.js';
import { toast } from './ui-helpers.js';

// A simple replacement for path.basename
function basename(filePath) {
  return filePath.split(/[/\\]/).pop();
}

export const applyRevisionFilter = () => {
  const { filterRevisionsCheckbox } = dom;
  const { allUploadedFiles } = getState();
  const enabled = filterRevisionsCheckbox.checked;
  const fileItems = document.querySelectorAll('#file-list-content .file-item');
  if (!enabled) { fileItems.forEach(i => i.classList.remove('filtered-out')); return; }

  const groups = new Map();
  fileItems.forEach(item => {
    if (!item.classList.contains('hidden')) {
      const { baseName } = parseFileName(item.dataset.name);
      if (!groups.has(baseName)) groups.set(baseName, []);
      groups.get(baseName).push(item);
    } else {
      item.classList.remove('filtered-out');
    }
  });

  for (const items of groups.values()) {
    if (items.length <= 1) { items.forEach(i => i.classList.remove('filtered-out')); continue; }
    const latest = items.reduce((a, b) => {
      const ra = parseFileName(a.dataset.name).revision;
      const rb = parseFileName(b.dataset.name).revision;
      return rb > ra ? b : a;
    });
    items.forEach(i => i.classList.toggle('filtered-out', i !== latest));
  }
  updateTotalMatchCount();
  // --- ИСПРАВЛЕНО ЗДЕСЬ ---
  // Раньше было: fileCountDisplay();
  // Правильно: вызвать функцию обновления, а не сам элемент.
  updateFileCount();
};
// --- Добавление файлов ---
export const handleFiles = async (filesOrPaths) => {
  const { allUploadedFiles } = getState();

  const list = Array.from(filesOrPaths || []);
  const fileObjs = list.map(item => {
    if (typeof item === 'string') {
      return { path: item, name: basename(item), type: 'application/pdf' };
    }
    if (item instanceof File) {
      return {
        path: item.path || null,
        name: item.name,
        type: item.type || 'application/pdf',
        _raw: item
      };
    }
    return null;
  }).filter(Boolean);

  const needPaths = fileObjs.some(f => !f.path);
  if (needPaths && window.electronAPI?.showOpenDialog) {
    try {
      const dlg = await window.electronAPI.showOpenDialog();
      const chosen = Array.isArray(dlg?.filePaths) ? dlg.filePaths.filter(p => /\.pdf$/i.test(p)) : [];
      if (chosen.length > 0) {
        return handleFiles(chosen);
      }
    } catch (e) {
      console.warn('[handleFiles] showOpenDialog failed:', e);
    }
  }

  const newFiles = fileObjs.filter(file =>
    (/\.pdf$/i.test(file.name)) &&
    !allUploadedFiles.some(ex => (file.path && ex.path === file.path) || ex.name === file.name)
  );
  if (newFiles.length === 0) return;

  // уведомление: используем t + toast
  if (newFiles.length > 0) {
    toast('filesAdded', { count: newFiles.length });
  }

  newFiles.forEach(f => { f.isAnalyzing = true; f.analysisResult = null; });
  setState({ allUploadedFiles: [...allUploadedFiles, ...newFiles] });

  // первый рендер + обновляем счётчики
  renderFileList();

  // запустить анализ добавленных файлов
  const analysisPromises = newFiles
    .filter(file => file.path)
    .map(file => runPreliminaryAnalysis(file));
  await Promise.allSettled(analysisPromises);

  // финальный рендер + обновляем счётчики
  renderFileList();
};


// --- Основной рендеринг списка файлов ---
export const renderFileList = () => {
  const { allUploadedFiles, currentTranslations } = getState();
  const { fileDropContainer, fileListContent, clearFilesBtn, fileFilterInput } = dom;

  const hasFiles = allUploadedFiles.length > 0;
  const filterText = (fileFilterInput?.value || '').toLowerCase();

  fileDropContainer.classList.toggle('has-files', hasFiles);
  fileDropContainer.classList.toggle('no-files', !hasFiles);
  clearFilesBtn.disabled = !hasFiles;

  if (!hasFiles) {
    fileListContent.innerHTML = `
      <div class="text-center">
        <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
          <span class="font-medium text-blue-600 dark:text-blue-400" data-lang="clickToUpload">${t('clickToUpload')}</span>
          <span data-lang="orDragAndDrop"> ${t('orDragAndDrop')}</span>
        </p>
        <p class="text-xs text-gray-500 dark:text-gray-500" data-lang="pdfFilesOnly">${t('pdfFilesOnly')}</p>
      </div>`;
    // Обновляем счетчики при пустом списке
    updateFileCount();
    updateTotalMatchCount();
    return;
  }
  
  fileListContent.innerHTML = '';

  allUploadedFiles.forEach((file, idx) => {
    const item = document.createElement('div');
    item.className = 'file-item p-2 rounded flex justify-between items-center';
    item.dataset.name = file.name;
    if (file.path) item.dataset.path = file.path;

    const visible = file.name.toLowerCase().includes(filterText);
    item.classList.toggle('hidden', !visible);

    const nameSpan = document.createElement('span');
    nameSpan.textContent = file.name;

    if (file.path) {
      // Если есть путь - делаем ссылкой
      nameSpan.className = 'cursor-pointer text-blue-600 dark:text-blue-400 hover:underline truncate';
      nameSpan.onclick = () => openPdfViewer(file);
    } else {
      // Нет пути - показываем серым и подсказку
      nameSpan.className = 'text-gray-400 dark:text-gray-500 italic truncate';
      nameSpan.title = 'This file was added without a path and cannot be opened';
    }

    const right = document.createElement('div');
    right.className = 'flex items-center gap-4 flex-shrink-0 ml-4';

    const resSpan = document.createElement('span');
    resSpan.className = 'text-sm';
    if (file.isAnalyzing) {
      resSpan.textContent = t('analyzing');
      resSpan.classList.add('italic', 'text-gray-500');
    } else if (file.analysisResult) {
      if (file.analysisResult.error) {
        resSpan.textContent = 'Error';
        resSpan.title = file.analysisResult.error;
        resSpan.classList.add('text-red-500', 'cursor-help');
      } else if (file.analysisResult.total > 0) {
        const label = t('foundMatchesFile', { total: file.analysisResult.total, unique: file.analysisResult.unique });
        nameSpan.title = label;
        resSpan.textContent = label;
        resSpan.className = 'text-sm font-semibold text-gray-500 dark:text-gray-400 cursor-pointer hover:underline';
        resSpan.onclick = () => openExportModal(file);
      } else {
        resSpan.textContent = t('noMatches');
        resSpan.classList.add('text-gray-500');
      }
    }

    const delBtn = document.createElement('button');
    delBtn.textContent = '✕';
    delBtn.className = 'text-red-500 hover:text-red-700 font-bold px-2';
    delBtn.onclick = () => {
      const updatedFiles = allUploadedFiles.filter((_, i) => i !== idx);
      setState({ allUploadedFiles: updatedFiles });
      renderFileList();
    };

    const leftWrap = document.createElement('div');
    leftWrap.className = 'flex items-center min-w-0';
    leftWrap.appendChild(nameSpan);

    right.append(resSpan, delBtn);
    item.append(leftWrap, right);
    fileListContent.appendChild(item);
  });

  applyRevisionFilter();
  updateFileCount();
  updateTotalMatchCount();
};

export const clearFileListUI = () => {
  const { pdfUpload, viewResultsBtn, fileFilterInput } = dom;
  setState({
    allUploadedFiles: [],
    capturedImages: [],
    analysisCompleted: false
  });
  if (pdfUpload) pdfUpload.value = '';
  viewResultsBtn.classList.add('hidden');
  fileFilterInput.value = '';
  renderFileList();
};
// --- Обновление счётчика файлов ---
export const updateFileCount = () => {
    const { allUploadedFiles } = getState();
    const { fileCountDisplay } = dom;
    if (fileCountDisplay) {
        if (allUploadedFiles.length > 0) {
            dom.fileCountDisplay.textContent = t('filesAdded', { count: allUploadedFiles.length });
        } else {
            dom.fileCountDisplay.textContent = '';
        }
    }
};
// --- Обновление счётчика найденных совпадений ---
export const updateTotalMatchCount = (forceValue = null) => {
    const { totalMatchesDisplay } = dom;
    if (!totalMatchesDisplay) return;

    let count;

    if (typeof forceValue === 'number') {
        count = forceValue;
    } else {
        const { capturedImages, allUploadedFiles } = getState();
        if (capturedImages && capturedImages.length > 0) {
            // если уже есть результаты финального анализа
            count = capturedImages.filter(i => !i.excluded).length;
        } else {
            // иначе считаем сумму по предварительному анализу файлов
            const visibleFiles = allUploadedFiles.filter(f => {
              const el = document.querySelector(`.file-item[data-name="${f.name}"]`);
              return el && !el.classList.contains('filtered-out');
            });
            count = (visibleFiles || [])
                .map(f => f.analysisResult?.total || 0)
                .reduce((a, b) => a + b, 0);
        }
    }

    dom.totalMatchesDisplay.textContent = t('totalMatches', { count });
};
