import { dom } from './dom-elements.js';
import { getState, setState } from './state-manager.js';
// Импортируем функции обновления для принудительного пере-рендеринга
import { updateFileCount, updateTotalMatchCount } from './file-and-ui.js';

// --- Translator ---
export const t = (key, vars = {}) => {
    const { currentTranslations } = getState();
    let text = currentTranslations?.[key];
    if (!text) return key;

    // Pluralization logic...
    if (typeof text === 'object') {
        const count = vars.count ?? 0;
        if (document.documentElement.lang === 'ru') {
            if (count % 10 === 1 && count % 100 !== 11) text = text.one;
            else if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) text = text.few;
            else text = text.many;
        } else {
            text = count === 1 ? text.one : text.other;
        }
    }
    
    if (typeof text !== 'string') {
        // Fallback if a plural form is missing but the key was an object
        return key;
    }

    // Variable substitution logic...
    for (const v in vars) {
        text = text.replace(`{{${v}}}`, vars[v]);
    }
    return text;
};

// Сделаем переводчик доступным для toast и др.
if (typeof window !== 'undefined') {
    window.t = t;
}

// --- Apply language ---
export const setLanguage = async (lang) => {
    if (!['en', 'ru', 'et'].includes(lang)) lang = 'en';

    try {
        const translations = (await window.electronAPI.loadTranslation(lang)) || {};
        setState({ currentTranslations: translations });
        if (typeof window !== 'undefined') window.t = t;

        // Apply translations to the DOM
        document.querySelectorAll('[data-lang]').forEach(el => {
            const key = el.getAttribute('data-lang');
            el.innerHTML = t(key);
        });
        document.querySelectorAll('[data-lang-placeholder]').forEach(el => {
            const key = el.getAttribute('data-lang-placeholder');
            el.placeholder = t(key);
        });

        // Update UI state
        document.documentElement.lang = lang;
        if (dom.langSwitcher) {
            dom.langSwitcher.querySelectorAll('.lang-btn').forEach(btn => {
                const active = btn.dataset.langCode === lang;
                btn.classList.toggle('active', active);
                btn.setAttribute('aria-pressed', String(active));
            });
        }
        
        // --- ИЗМЕНЕНИЕ ЗДЕСЬ ---
        // Принудительно обновляем динамические счетчики с новыми переводами
        updateFileCount();
        updateTotalMatchCount();

    } catch (e) {
        console.warn(`[i18n] failed to load ${lang}.json`, e);
    }
};

