// ui-helpers.js
// ЕДИНСТВЕННЫЙ файл, отвечающий за применение настроек к UI
import { dom } from './dom-elements.js';
import { setLanguage } from './i18n.js';
import { setCurrentSettings } from './state-manager.js';

/**
 * Главная функция, которая применяет ВСЕ настройки к интерфейсу главного окна.
 * @param {object} settings - Объект настроек из main.js
 */
export const applySettingsToUI = (settings) => {
    if (!settings) return;

    console.log('[UI] Применение настроек к главному окну:', settings);

    // Сохраняем настройки в глобальном состоянии
    setCurrentSettings(settings);

    // 1. Применяем язык
    if (settings.language) {
        setLanguage(settings.language); // Вызываем чистую функцию из i18n.js
    }

    // 2. Применяем тему
    const isDark = settings.theme === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
    updateThemeIcons(isDark);

    // 3. Применяем остальные настройки из вашего кода
    // (Я объединил их для полноты картины)
    if (dom.prefixDisplay) dom.prefixDisplay.textContent = settings.prefix || 'W';
    if (dom.captureWidthInput) dom.captureWidthInput.value = settings.screenshot_width || 200;
    if (dom.captureHeightInput) dom.captureHeightInput.value = settings.screenshot_height || 88;
    if (dom.positionXInput) dom.positionXInput.value = settings.text_pos_x || 50;
    if (dom.positionYInput) dom.positionYInput.value = settings.text_pos_y || 50;

    // Чекбоксы в главном окне (если они есть)
    if (dom.includeRevisionSideCheckbox) dom.includeRevisionSideCheckbox.checked = !!settings.include_revision;
    if (dom.latestRevisionSideCheckbox) dom.latestRevisionSideCheckbox.checked = !!settings.process_latest_revision;
    if (dom.removeDuplicatesSideCheckbox) dom.removeDuplicatesSideCheckbox.checked = !!settings.remove_duplicates;
    if (dom.useOcrSideCheckbox) dom.useOcrSideCheckbox.checked = !!settings.use_ocr;

    // Обновляем превью после применения всех настроек
    updateCapturePreview();
};


export const updateCapturePreview = () => {
    const { captureWidthInput, captureHeightInput, positionXInput, positionYInput, capturePreview, positionXLabel, positionYLabel } = dom;
    if (!capturePreview) return; // Защита, если элементы не найдены
    const width = +(captureWidthInput?.value) || 200;
    const height = +(captureHeightInput?.value) || 88;
    const posX = String(positionXInput?.value || 50);
    const posY = String(positionYInput?.value || 50);
    const previewScale = 0.4;
    capturePreview.style.width = `${Math.max(20, width * previewScale)}px`;
    capturePreview.style.height = `${Math.max(20, height * previewScale)}px`;
    capturePreview.style.setProperty('--pos-x', `${posX}%`);
    capturePreview.style.setProperty('--pos-y', `${posY}%`);
    if (positionXLabel) positionXLabel.textContent = posX;
    if (positionYLabel) positionYLabel.textContent = posY;
};

export const toast = (keyOrMessage, vars = {}, isError = false) => {
    const { t } = window;
    // если есть t — попробуем как ключ; если ключа нет, t вернёт сам keyOrMessage
    const message = t ? t(keyOrMessage, vars) : String(keyOrMessage);
    const box = document.createElement('div');
    const isDark = document.documentElement.classList.contains('dark');
    const bgColor = isError
        ? (isDark ? 'rgba(239,68,68,0.7)' : 'rgba(239,68,68,.9)')
        : (isDark ? 'rgba(34,197,94,0.7)' : 'rgba(34,197,94,.9)');
    const textColor = '#fff';

    Object.assign(box.style, {
        position: 'fixed',
        top: '150px',
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '10px 20px',
        backgroundColor: bgColor,
        color: textColor,
        borderRadius: '8px',
        zIndex: '10000',
        boxShadow: '0 4px 6px rgba(0,0,0,.1)',
        transition: 'opacity .5s',
        textAlign: 'center'
    });
    box.textContent = message;
    document.body.appendChild(box);
    setTimeout(() => {
        box.style.opacity = '0';
        setTimeout(() => box.remove(), 500);
    }, 2500);
};

export const updateThemeIcons = (isDark) => {
    const { themeToggleDarkIcon, themeToggleLightIcon } = dom;
    if (themeToggleDarkIcon && themeToggleLightIcon) {
        themeToggleDarkIcon.classList.toggle('hidden', !isDark);
        themeToggleLightIcon.classList.toggle('hidden', isDark);
    }
};

export const updateMaximizeIcon = (isMaximized) => {
    const { maximizeBtn } = dom;
    if (maximizeBtn) {
        const maximizeIcon = maximizeBtn.querySelector('.icon-maximize');
        const restoreIcon = maximizeBtn.querySelector('.icon-restore');
        if (maximizeIcon && restoreIcon) {
            maximizeIcon.classList.toggle('hidden', isMaximized);
            restoreIcon.classList.toggle('hidden', !isMaximized);
        }
    }
};

export const isReallyMaximized = () => {
    if (window.electronAPI) {
        return false;
    }
    return window.innerWidth === screen.availWidth && window.innerHeight === screen.availHeight;
};

export const ensureWindowControlIcons = () => {
    const { minimizeBtn, maximizeBtn, closeBtn } = dom;
    if (minimizeBtn && !minimizeBtn.innerHTML.trim()) {
        minimizeBtn.innerHTML = '<svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><rect y="5" width="12" height="2" rx="1"/></svg>';
    }
    if (maximizeBtn && !maximizeBtn.innerHTML.trim()) {
        maximizeBtn.innerHTML = `
            <span class="icon-maximize" aria-hidden="true">
                <svg viewBox="0 0 12 12" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M1 1h10v10H1V1zm9 1H2v8h8V2z"/></svg>
            </span>
            <span class="icon-restore hidden" aria-hidden="true">
                <svg viewBox="0 0 12 12" fill="currentColor">
                    <path d="M2 4h6v6H2z"></path>
                    <path d="M4 2h6v6h-1V3H4z"></path>
                </svg>
            </span>`;
    }
    if (closeBtn && !closeBtn.innerHTML.trim()) {
        closeBtn.innerHTML = '<svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M11.268 0L6 5.268.732 0 0 .732 5.268 6 0 11.268l.732.732L6 6.732l5.268 5.268.732-.732L6.732 6 12 .732 11.268 0z"/></svg>';
    }
};
