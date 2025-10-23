"use strict";

const { app, BrowserWindow, ipcMain, dialog, shell, globalShortcut, session, protocol } = require("electron");
const path = require("path");
const url = require("url");
const { spawn } = require("child_process");
const fs = require("fs").promises;
const fsSync = require("fs");
const { autoUpdater } = require("electron-updater");

// Зарегистрировать схему ДО whenReady, чтобы fetch/XHR понимали appfile://
protocol.registerSchemesAsPrivileged([{
  scheme: "appfile",
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true
  }
}]);

// ---------------- Env & State ----------------
const isProd = app.isPackaged;
let mainWindow;
let settingsWindow;

// ---------------- Paths ----------------
const SETTINGS_PATH = path.join(app.getPath("userData"), "settings.json");
const RESOURCES_PATH = process.resourcesPath;

const BACKEND_DIR = isProd
  ? path.join(RESOURCES_PATH, "backend")
  : path.join(__dirname, "..", "..", "backend");

const PYTHON_EXECUTABLE_PROCESS_PDFS = isProd
  ? path.join(BACKEND_DIR, "process_pdfs", "process_pdfs.exe") // ИСПРАВЛЕНО
  : path.join(
      BACKEND_DIR,
      ".venv",
      process.platform === "win32" ? path.join("Scripts", "python.exe") : path.join("bin", "python")
    );

// Если у вас есть также backend_ocr, для него нужно сделать аналогично:
const PYTHON_EXECUTABLE_BACKEND_OCR = isProd
  ? path.join(BACKEND_DIR, "backend_ocr", "backend_ocr.exe") // ДОБАВЛЕНО
  : path.join(
      BACKEND_DIR,
      ".venv", // Предполагаем, что для dev-режима вы тоже запускаете его через venv
      process.platform === "win32" ? path.join("Scripts", "python.exe") : path.join("bin", "python")
    );


const PYTHON_SCRIPT_PATH = isProd ? null : path.join(BACKEND_DIR, "process_pdfs.py"); // Этот путь для dev, и он останется прежним.

// ---------------- Settings Management ----------------
const DEFAULT_SETTINGS = {
  prefix: "W",
  max_digits: 5,
  include_revision: false,
  uiScale: 0.88,
  language: "en",
  process_latest_revision: false,
  remove_duplicates: false,
  use_ocr: false,
  screenshot_width: 200,
  screenshot_height: 68,
  text_pos_x: 50,
  text_pos_y: 50,
  pdf_viewer_mode: "builtin",
};


async function readSettings() {
  try {
    const data = await fs.readFile(SETTINGS_PATH, "utf8");
    const parsed = JSON.parse(data);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch (error) {
    console.error("Failed to read settings:", error);
    return DEFAULT_SETTINGS;
  }
}

async function writeSettings(settings) {
  try {
    await fs.mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
    await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf8");
  } catch (error) {
    console.error("Failed to write settings:", error);
  }
}

// --- IPC handler for getting settings ---
ipcMain.handle("get-settings", async () => {
  return await readSettings();
});

// ---------------- Helpers ----------------
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

function isHttpUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === "https:" || x.protocol === "http:";
  } catch {
    return false;
  }
}

function hasAllowedExt(file, allowed = [".pdf"]) {
  if (typeof file !== "string" || !file) return false;
  return allowed.includes(path.extname(file).toLowerCase());
}

async function statIsFile(p) {
  try {
    return (await fs.stat(p)).isFile();
  } catch {
    return false;
  }
}

function isFilePath(p) {
  try {
    return !!p && typeof p === "string" && (p.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(p));
  } catch {
    return false;
  }
}

// ---------------- Expiration Check ----------------
async function checkIsExpired() {
  try {
    const configPath = path.join(__dirname, "..", "..", "Frontend", "config.json");
    const configData = await fs.readFile(configPath, "utf8");
    const config = JSON.parse(configData);
    const expiresAtStr = config.expires_at;

    if (!expiresAtStr) return { isExpired: false };

    let currentUtcDate;
    try {
      const ctrl = AbortSignal.timeout(5000);
      const response = await fetch("https://worldtimeapi.org/api/timezone/Etc/UTC", { signal: ctrl });
      if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
      const data = await response.json();
      currentUtcDate = new Date(data.utc_datetime);
    } catch (e) {
      console.warn("[ExpirationCheck] Online time check failed, falling back to system time.", e.message);
      currentUtcDate = new Date();
    }

    const expiresDate = new Date(expiresAtStr);
    expiresDate.setUTCHours(23, 59, 59, 999);

    return { isExpired: currentUtcDate > expiresDate };
  } catch (error) {
    console.error("[ExpirationCheck] Failed to read or parse config:", error);
    return { isExpired: false };
  }
}

// ---------------- i18n ----------------
const AVAILABLE_LANGS = ["en", "ru", "et"];
let currentLang = "en"; // язык по умолчанию

// --- ИСПРАВЛЕНИЕ: Эти обработчики теперь принимают язык от рендерера ---
ipcMain.handle("load-translation", async (_event, lang) => {
  const langToLoad = AVAILABLE_LANGS.includes(lang) ? lang : currentLang;
  try {
    const filePath = path.join(__dirname, "lang", `${langToLoad}.json`);
    await fs.access(filePath);
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch (e) {
    console.error(`[i18n] load failed for "${langToLoad}.json":`, e.message);
    return null;
  }
});

// Обработчик для окна настроек теперь ТОЖЕ принимает язык
ipcMain.handle("load-settings-translation", async (_event, lang) => {
    const langToLoad = AVAILABLE_LANGS.includes(lang) ? lang : currentLang;
  try {
    const filePath = path.join(__dirname, "lang", `settings_${langToLoad}.json`);
    await fs.access(filePath);
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch (e) {
    console.error(`[i18n] settings load failed for "settings_${langToLoad}.json":`, e.message);
    return null;
  }
});
  
// ---------------- Python Runner ----------------
/**
 * Запускает Python-скрипт или скомпилированный EXE-файл.
 * @param {string} command - Команда, передаваемая в Python-скрипт.
 * @param {Array<string>} argsArray - Дополнительные аргументы для Python-скрипта.
 * @param {object | null} stdinPayload - JSON-объект для передачи через stdin.
 * @param {boolean} useOCR - Флаг, указывающий, нужно ли использовать OCR-бэкенд.
 * @returns {Promise<any>} Промис, который разрешается с результатом работы Python-скрипта.
 */
function runPythonScript(command, argsArray = [], stdinPayload = null, useOCR = false) {
  return new Promise((resolve, reject) => {
    let executablePath; // Переменная для пути к исполняемому файлу (python.exe или .exe бэкенда)
    let scriptPath;     // Переменная для пути к .py скрипту (только в dev-режиме)
    let cwdForPython;   // Переменная для установки текущей рабочей директории для процесса Python

    if (isProd) {
      // --- Режим Production (упакованное Electron-приложение) ---
      // Определяем имя исполняемого файла PyInstaller (например, "backend_ocr.exe")
      const executableFileName = useOCR ? "backend_ocr.exe" : "process_pdfs.exe";
      // Определяем имя папки, в которую PyInstaller упаковал исполняемый файл
      // (например, "backend_ocr" для backend_ocr.exe)
      const executableFolderName = useOCR ? "backend_ocr" : "process_pdfs";

      // Формируем полный путь к исполняемому файлу.
      // Теперь он будет выглядеть так: ...resources/backend/имя_папки/имя_exe_файла
      executablePath = path.join(BACKEND_DIR, executableFolderName, executableFileName);

      // Устанавливаем рабочую директорию для процесса Python.
      // Это критично: CWD должно быть папкой, где находится сам .exe-файл,
      // чтобы он мог найти свои внутренние ресурсы (библиотеки, данные и т.п.).
      cwdForPython = path.join(BACKEND_DIR, executableFolderName);

      // Проверка существования файла перед попыткой запуска.
      // Улучшенное сообщение об ошибке для более ясной диагностики.
      if (!fsSync.existsSync(executablePath)) {
        return reject(new Error(`Required executable not found: ${executablePath}. 
                                 Please ensure PyInstaller builds are correct and copied by Electron Builder.`));
      }
    } else {
      // --- Режим Разработки (Electron запущен из исходников) ---
      // В dev-режиме мы запускаем интерпретатор Python из виртуального окружения
      executablePath = path.join(
        BACKEND_DIR,
        ".venv", // Путь к виртуальному окружению
        process.platform === "win32" ? "Scripts" : "bin", // Папка со скриптами в зависимости от ОС
        "python.exe" // Сам интерпретатор Python
      );
      // Определяем путь к .py файлу, который будет передан интерпретатору Python
      // (process_pdfs_ocr.py для OCR, process_pdfs.py для обычного анализа)
      scriptPath = path.join(BACKEND_DIR, useOCR ? "process_pdfs_ocr.py" : "process_pdfs.py");
      // Рабочая директория в dev-режиме - это корневая папка бэкенда,
      // где лежат .py скрипты и .venv
      cwdForPython = BACKEND_DIR;
    }

    // Определяем аргументы для запуска процесса.
    // В prod-режиме первым аргументом идет команда, т.к. сам .exe уже является программой.
    // В dev-режиме первым аргументом идет путь к .py скрипту, затем команда.
    const args = isProd
      ? [command, ...argsArray]
      : [scriptPath, command, ...argsArray];

    // Запускаем дочерний процесс Python (или PyInstaller EXE)
    const py = spawn(executablePath, args, {
      windowsHide: true, // Скрыть консольное окно для Windows
      stdio: ["pipe", "pipe", "pipe"], // Настроить ввод/вывод как пайпы для общения
      cwd: cwdForPython // Устанавливаем рабочую директорию, определенную выше
    });

    let stdout = "", stderr = "";
    // Собираем весь вывод из stdout и stderr
    py.stdout.on("data", (d) => { stdout += d.toString("utf8"); });
    py.stderr.on("data", (d) => { stderr += d.toString("utf8"); });

    // Обработка завершения дочернего процесса
    py.on("close", (code) => {
      if (code !== 0) {
        // Если процесс завершился с ошибкой (ненулевой код выхода)
        console.error(`[python:${command}]`, stderr);
        return reject(new Error(stderr.trim() || `Python exited with code ${code}`));
      }
      // Если все успешно, парсим вывод
      const out = stdout.trim();
      // Проверяем, является ли вывод просто путем к файлу
      if (isFilePath(out)) return resolve({ filePath: out });
      try {
        // Пытаемся распарсить вывод как JSON
        const parsed = JSON.parse(out);
        // Если в JSON есть поле 'error', считаем это ошибкой
        if (parsed && parsed.error) return reject(new Error(parsed.message || "Python error"));
        // Возвращаем данные или весь JSON-объект
        return resolve(parsed?.data ?? parsed);
      } catch {
        // Если вывод не является валидным JSON, считаем это ошибкой парсинга
        return reject(new Error(`Invalid JSON from python (${command}): ${out}`));
      }
    });

    // Обработка ошибок при запуске процесса (например, файл не найден, нет прав)
    py.on("error", (err) => reject(err));

    // Если есть данные для stdin, записываем их в дочерний процесс
    if (stdinPayload != null) {
      try { py.stdin.write(JSON.stringify(stdinPayload)); } catch {}
      finally { try { py.stdin.end(); } catch {} } // Всегда закрываем stdin
    }
  });
}

// ---------------- IPC Handlers ----------------
// --- Backend ---
ipcMain.handle("run-analysis", async (_event, filePaths, options) => {
  try {
    if (!Array.isArray(filePaths) || filePaths.length === 0) throw new Error("No files provided.");
    if (filePaths.length > 200) throw new Error("Max 200 files at once.");
    if (typeof options !== "object" || !options) throw new Error("Invalid options.");

    const absPaths = (
      await Promise.all(
        filePaths.map(async (p) => {
          if (typeof p !== "string" || !hasAllowedExt(p, [".pdf"])) return null;
          const abs = path.resolve(p);
          return (await statIsFile(abs)) ? abs : null;
        })
      )
    ).filter(Boolean);

    if (absPaths.length === 0) throw new Error("No valid PDF files found.");
    options.app_version = app.getVersion();
    // --- Новый код: передаём флаг OCR
    const useOCR = !!options.use_ocr;
    const data = await runPythonScript("analyze", [JSON.stringify(options), ...absPaths], null, useOCR);

    return { success: true, data };
  } catch (error) {
    console.error("[run-analysis]", error);
    return { success: false, error: error.message };
  }
});


ipcMain.handle("export-report", async (_event, payload) => {
  let tempFile = "";
  try {
    if (typeof payload !== "object" || !payload) throw new Error("Invalid export payload.");
       if (payload.options) {
      payload.options.app_version = app.getVersion();
      } else {
      // Создаем объект options, если он вдруг отсутствует
      payload.options = { app_version: app.getVersion() };
      }    
    const result = await runPythonScript("export", [], payload);
    tempFile = result?.filePath;
    if (!tempFile || !fsSync.existsSync(tempFile)) throw new Error("No file returned by backend.");

    const format = String(payload.format || "").toLowerCase();
    const filters =
      {
        pdf: [{ name: "PDF Document", extensions: ["pdf"] }],
        csv: [{ name: "CSV File", extensions: ["csv"] }],
        txt: [{ name: "Text File", extensions: ["txt"] }],
      }[format] || [];

    const { filePath, canceled } = await dialog.showSaveDialog({
      title: `Save ${format.toUpperCase()} Report`,
      defaultPath: `report-${Date.now()}.${format || "pdf"}`,
      filters,
    });
    if (canceled || !filePath) return { success: false, error: "Save cancelled." };

    await fs.copyFile(tempFile, filePath);
    return { success: true, path: filePath };
  } catch (error) {
    console.error("[export-report]", error);
    return { success: false, error: error.message };
  } finally {
    if (tempFile && fsSync.existsSync(tempFile)) {
      try { await fs.unlink(tempFile); } catch {}
    }
  }
});

ipcMain.handle("get-app-version", () => app.getVersion());
ipcMain.handle("get-app-name", () => app.getName());

// --- Dialogs & Openers ---
ipcMain.handle("show-open-dialog", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return dialog.showOpenDialog(win, {
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "PDF Documents", extensions: ["pdf"] }],
  });
});

ipcMain.handle("dialog:openFile", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "PDF files", extensions: ["pdf"] }],
  });
  if (canceled) return { canceled: true, files: [] };
  return { canceled, files: filePaths.map((f) => ({ path: f, name: path.basename(f) })) };
});

ipcMain.on("open-external-link", (_e, maybeUrl) => {
  if (typeof maybeUrl === "string" && isHttpUrl(maybeUrl)) shell.openExternal(maybeUrl);
});

ipcMain.handle("open-file-in-default-app", async (_e, filePath) => {
  try {
    if (typeof filePath !== "string" || !(await statIsFile(filePath))) {
      throw new Error("Invalid file path provided.");
    }
    const errorMessage = await shell.openPath(filePath);
    if (errorMessage) throw new Error(errorMessage);
    return { success: true };
  } catch (err) {
    console.error("open-file-in-default-app error:", err.message);
    dialog.showErrorBox("Open File Error", `Could not open file:\n${filePath}`);
    return { success: false, error: err.message };
  }
});

ipcMain.handle("open-file-in-builtin-viewer", async (_e, filePath, page = 1) => {
  try {
    if (typeof filePath !== "string" || !(await statIsFile(filePath))) {
      throw new Error("Invalid file path provided.");
    }
    return { success: true, filePath, page };
  } catch (err) {
    console.error("open-file-in-builtin-viewer error:", err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle("open-pdf-at-page", async (_e, { filePath, page }) => {
  try {
    if (typeof filePath !== "string" || !(await statIsFile(filePath))) throw new Error("Invalid file path provided.");
    if (typeof page !== "number" || page < 1) throw new Error("Invalid page number provided.");
    const fileUrl = url.pathToFileURL(filePath).href;
    const urlWithPage = `${fileUrl}#page=${page}`;
    await shell.openExternal(urlWithPage);
    return { success: true };
  } catch (err) {
    console.error("open-pdf-at-page error:", err.message);
    const displayPath = typeof filePath === "string" ? filePath : "N/A";
    dialog.showErrorBox("Open File Error", `Could not open file at page:\n${displayPath}\n\nError: ${err.message}`);
    return { success: false, error: err.message };
  }
});

// --- Settings ---
ipcMain.on("open-settings-window", () => createSettingsWindow());
ipcMain.on("check-for-updates", () => autoUpdater.checkForUpdatesAndNotify());
ipcMain.handle("save-settings", async (_event, settings) => {
  const currentSettings = await readSettings();
  const newSettings = { ...currentSettings, ...settings };
  await writeSettings(newSettings);

  if (newSettings.language && AVAILABLE_LANGS.includes(newSettings.language)) {
    currentLang = newSettings.language;
  }

  if (mainWindow && !mainWindow.isDestroyed())
    mainWindow.webContents.send("settings-updated", newSettings);
  if (settingsWindow && !settingsWindow.isDestroyed())
    settingsWindow.webContents.send("settings-updated", newSettings);

  return { success: true };
});

ipcMain.handle("uiScale:set", async (_e, factor) => {
  const f = clamp(Number(factor) || DEFAULT_SETTINGS.uiScale, 0.5, 1.0);
  const settings = await readSettings();
  settings.uiScale = f;
  await writeSettings(settings);
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.webContents.setZoomFactor(f);
      mainWindow.webContents.setVisualZoomLevelLimits(1, 1);
    } catch {}
  }
  return f;
});

// ---------------- Window Creation ----------------
function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 1000,
    height: 950,
    minWidth: 700,
    minHeight: 500,
    parent: mainWindow,
    modal: true,
    resizable: true,
    frame: false,
    titleBarStyle: "hidden",
    transparent: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  settingsWindow.loadFile(path.join(__dirname, "settings.html"));

  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

async function createWindow() {
  const { isExpired } = await checkIsExpired();

  mainWindow = new BrowserWindow({
    width: isExpired ? 600 : 1280,
    height: isExpired ? 800 : 900,
    minWidth: isExpired ? 480 : 940,
    minHeight: isExpired ? 500 : 600,
    resizable: true,
    backgroundColor: "#1e192e",
    icon: path.join(__dirname, "..", "..", "frontend", "assets", "icon.ico"),
    frame: false,
    titleBarStyle: "hidden",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, "preload.js"),
      devTools: !isProd,
    },
  });

  if (process.platform === "darwin") {
    try { mainWindow.setWindowButtonVisibility(false); } catch {}
  }

  wireFindShortcuts(mainWindow);

  // ✅ ИСПРАВЛЕННАЯ ЛОГИКА: Все настройки применяются только здесь
  mainWindow.webContents.on('did-finish-load', async () => {
    // 1. Считываем настройки из файла
    const settings = await readSettings();
    
    // 2. Применяем настройки, которые касаются самого окна (зум)
    if (settings.uiScale) {
        const zoomFactor = clamp(Number(settings.uiScale), 0.5, 1.0);
        mainWindow.webContents.setZoomFactor(zoomFactor);
        try { mainWindow.webContents.setVisualZoomLevelLimits(1, 1); } catch {}
    }

    // 3. Отправляем ПОЛНЫЙ объект настроек в окно для обновления UI
    mainWindow.webContents.send('settings-updated', settings);
  });

  // Загружаем HTML-файл
  await mainWindow.loadFile(path.join(__dirname, isExpired ? "expired.html" : "index.html"));

  // ❌ ЭТОТ БЛОК УДАЛЕН, так как он выполняется слишком рано и дублирует логику
  /*
   const settings = await readSettings();
   mainWindow.webContents.setZoomFactor(clamp(settings.uiScale, 0.5, 1.0));
   try { mainWindow.webContents.setVisualZoomLevelLimits(1, 1); } catch {}
  */

  mainWindow.once("ready-to-show", () => { mainWindow.show(); });

  mainWindow.on("maximize", () => { mainWindow.webContents.send("window:is-maximized", true); });
  mainWindow.on("unmaximize", () => { mainWindow.webContents.send("window:is-maximized", false); });
}

function wireFindShortcuts(win) {
  win.webContents.on("before-input-event", (event, input) => {
    if ((input.control || input.meta) && input.key.toLowerCase() === "f") {
      event.preventDefault();
      win.webContents.send("find:show");
    }
  });
}

// --- Find in page (Ctrl/Cmd+F) ---
ipcMain.on("find:text", (event, text, opts) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && text) {
    try {
      win.webContents.findInPage(text, opts || {});
    } catch (e) {
      console.error("[findInPage] error:", e);
    }
  }
});

ipcMain.on("find:stop", (event, action) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    try {
      win.webContents.stopFindInPage(action || "clearSelection");
    } catch (e) {
      console.error("[stopFindInPage] error:", e);
    }
  }
});


// ---------------- App Lifecycle ----------------

/**
 * Загружает начальные настройки приложения, например язык.
 */
async function loadInitialSettings() {
  const settings = await readSettings();
  if (settings.language && AVAILABLE_LANGS.includes(settings.language)) {
    currentLang = settings.language;
  }
}

/**
 * Регистрирует кастомный протокол appfile:// для доступа к локальным файлам.
 * Используется ваша оригинальная, проверенная логика обработки путей.
 */
function registerCustomProtocols() {
  protocol.registerBufferProtocol("appfile", async (request, respond) => {
    try {
      let p;
      // Блок обработки путей для Windows, функционально идентичный вашему.
      if (process.platform === "win32") {
        const u = new URL(request.url);
        let host = u.host;
        p = decodeURIComponent(u.pathname || "");

        if (/^[A-Za-z]:?$/.test(host)) {
          const drive = `${host[0].toUpperCase()}:`;
          if (!p.startsWith("/")) p = `/${p}`;
          p = `${drive}${p}`;
        } else if (/^\/[A-Za-z]:\//.test(p)) {
          p = p.slice(1);
        } else if (/^\/[A-Za-z]\//.test(p)) {
          p = p.replace(/^\/([A-Za-z])\//, (_m, d) => `${d.toUpperCase()}:/`);
        }
      } else {
        // Для других ОС (macOS, Linux) просто берем pathname.
        p = decodeURIComponent(new URL(request.url).pathname);
      }

      // Используем path.normalize для корректного преобразования пути для текущей ОС.
      const finalPath = path.normalize(p);
      const data = await fs.readFile(finalPath);

      // Более чистый способ определения MIME-типа
      const mimeTypes = {
        ".pdf": "application/pdf",
        ".html": "text/html",
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
      };
      const ext = path.extname(finalPath).toLowerCase();
      const mimeType = mimeTypes[ext] || "application/octet-stream";

      respond({ mimeType, data });
    } catch (e) {
      console.error(`[appfile] failed to load ${request.url}:`, e);
      respond({ statusCode: 404, data: Buffer.from("Not found") });
    }
  });
}

/**
 * Настраивает политику безопасности контента (CSP).
 */
function configureCSP() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "script-src 'self' https://cdn.tailwindcss.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com;"
        ],
      },
    });
  });
}

/**
 * Настраивает обработчики IPC для управления окном.
 */
function setupIPCHandlers() {
  ipcMain.on("window-control", (event, action) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    switch (action) {
      case "minimize": win.minimize(); break;
      case "maximize": win.isMaximized() ? win.unmaximize() : win.maximize(); break;
      case "close": win.close(); break;
    }
  });
}

/**
 * Применяет настройки для продакшн-сборки.
 */
function applyProductionSettings() {
  if (!isProd) return;
  mainWindow.removeMenu();
  const noop = () => {};
  globalShortcut.register("CommandOrControl+Shift+I", noop);
  globalShortcut.register("F12", noop);
  globalShortcut.register("CommandOrControl+R", noop);
  globalShortcut.register("CommandOrControl+Shift+R", noop);
}

// --- Основная логика запуска приложения ---
app.whenReady().then(async () => {
  await loadInitialSettings();
  registerCustomProtocols();
  configureCSP();
  setupIPCHandlers();

  await createWindow();
  applyProductionSettings();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ---------------- OCR Availability Check ----------------
// Проверяем наличие папки backend_ocr в ресурсах приложения
// "Умное" определение пути к OCR бэкенду для dev и production режимов
const backendOcrPath = app.isPackaged
  ? path.join(process.resourcesPath, 'backend', 'backend_ocr')      // Путь в собранном приложении
  : path.join(app.getAppPath(), 'dist', 'backend_ocr');              // Путь в режиме разработки (без "..")

// Для отладки можно оставить эту строку, чтобы видеть путь в консоли
console.log(`[OCR Check] isPackaged: ${app.isPackaged}, Path: ${backendOcrPath}`);

const isOcrAvailable = fsSync.existsSync(backendOcrPath);

// Создаем обработчик, который frontend сможет вызвать, чтобы узнать о наличии OCR
ipcMain.handle('is-ocr-available', () => {
  return isOcrAvailable;
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});