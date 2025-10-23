import { dom } from './dom-elements.js';
import { getState, setState } from './state-manager.js';

// ---------- PDF VIEWER ----------
export const openPdfViewer = (file, pageNumber = null) => {
  const { currentSettings } = getState();
  const viewerMode = currentSettings?.pdf_viewer_mode || 'builtin';

  if (viewerMode === 'system') {
    if (!file?.path) {
      console.error('[PDF] Missing path for system viewer', file);
      return;
    }
    window.electronAPI.openFileInSystem(file.path)
      .catch(err => console.error('[PDF] System open failed:', err));
    return;
  }

  // builtin (PDF.js)
  if (!file?.path) {
    console.error('[PDF] Missing path for builtin viewer', file);
    return;
  }

  const { pdfViewerModal, pdfViewerIframe, pdfViewerTitle } = dom;
  if (!pdfViewerModal || !pdfViewerIframe) {
    console.error('[PDF] Modal or iframe not found in DOM');
    return;
  }

  // ВАЖНО: appfile:// + нормализованные слэши (без backslash), иначе URL будет невалидным
  const normalizedPath = String(file.path).replace(/\\/g, '/');
  const appUrl = `appfile://${normalizedPath}`;
  const fragment = pageNumber ? `#page=${pageNumber}` : '';

  // viewer.html лежит в Frontend/app/vendor/web/
  const viewerUrl = `./vendor/web/viewer.html?file=${encodeURIComponent(appUrl)}&debug=1${fragment}`;

  // Логи для диагностики
  console.log('[PDF] file.path =', file.path);
  console.log('[PDF] viewerUrl =', viewerUrl);

  // Сброс и загрузка
  pdfViewerIframe.src = 'about:blank';

  const onLoad = () => console.log('[PDF] viewer iframe loaded');
  const onError = (e) => console.error('[PDF] iframe error:', e);
  pdfViewerIframe.addEventListener('load', onLoad, { once: true });
  pdfViewerIframe.addEventListener('error', onError, { once: true });

  if (pdfViewerTitle) pdfViewerTitle.textContent = `${file.name} (Page ${pageNumber || 1})`;

  pdfViewerIframe.src = viewerUrl;
  pdfViewerModal.classList.remove('hidden');
};

export const closePdfViewer = () => {
  const { pdfViewerModal, pdfViewerIframe } = dom;
  // Логика для Object URL (createObjectURL) больше не используется,
  // так как просмотрщик работает через протокол appfile://.
  if (pdfViewerModal) pdfViewerModal.classList.add('hidden');
  if (pdfViewerIframe) pdfViewerIframe.src = 'about:blank';
};

// ---------- HELP MODAL ----------
export const openHelpModal = () => {
  const { helpModal, helpModalContent } = dom;
  const { currentTranslations } = getState();
  if (!helpModal) return;
  if (helpModalContent) helpModalContent.innerHTML = currentTranslations?.helpContent || '';
  helpModal.classList.remove('hidden');
};

export const closeHelpModal = () => {
  const { helpModal } = dom;
  if (helpModal) helpModal.classList.add('hidden');
};

// ---------- EXPORT MODAL ----------
export const openExportModal = (file) => {
  const { fileExportModal, fileExportFilename } = dom;
  if (!fileExportModal) return;
  if (!file || !file.analysisResult || file.analysisResult.total === 0) return;
  setState({ currentFileForExport: file });
  if (fileExportFilename) fileExportFilename.textContent = file.name;
  fileExportModal.classList.remove('hidden');
};

export const closeExportModal = () => {
  const { fileExportModal, fileExportFilename } = dom;
  if (!fileExportModal) return;
  fileExportModal.classList.add('hidden');
  setState({ currentFileForExport: null });
  if (fileExportFilename) fileExportFilename.textContent = '';
};
