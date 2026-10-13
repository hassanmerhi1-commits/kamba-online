const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const PREFERRED_PORT = 4871; // fixed so saved cart / login survive restarts

// Where the server code and the built apps live (installed vs. running from the project folder).
const base = app.isPackaged ? process.resourcesPath : path.resolve(__dirname, '..');
const dirs = app.isPackaged
  ? { server: path.join(base, 'server', 'src'), customer: path.join(base, 'customer'), admin: path.join(base, 'admin') }
  : {
      server: path.join(base, 'server', 'src'),
      customer: path.join(base, 'mobile', 'dist'),
      admin: path.join(base, 'admin', 'dist'),
    };

let running = null; // { server, db, port }
let customerWin = null;
let adminWin = null;

const dbFile = () => path.join(app.getPath('userData'), 'kamba.db');

const uploadsDir = () => path.join(app.getPath('userData'), 'uploads');

async function startBackend({ demo = true } = {}) {
  const { start } = await import(pathToFileURL(path.join(dirs.server, 'start.js')).href);
  const options = {
    dbFile: dbFile(),
    demo,
    uploadsDir: uploadsDir(),
    adminUser: process.env.ADMIN_USER ?? 'admin',
    adminPassword: process.env.ADMIN_PASSWORD ?? 'kamba2026',
    customerDir: dirs.customer,
    adminDir: dirs.admin,
  };
  try {
    running = await start({ ...options, port: PREFERRED_PORT });
  } catch (err) {
    if (err && err.code === 'EADDRINUSE') running = await start({ ...options, port: 0 });
    else throw err;
  }
}

async function stopBackend() {
  if (!running) return;
  const { server, db } = running;
  running = null;
  await new Promise((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections?.();
  });
  try {
    db.close();
  } catch {
    /* already closed */
  }
}

const urlFor = (which) => `http://127.0.0.1:${running.port}${which === 'admin' ? '/admin' : '/'}`;

function makeWindow(which) {
  const isAdmin = which === 'admin';
  const win = new BrowserWindow({
    width: isAdmin ? 1200 : 480,
    height: isAdmin ? 800 : 860,
    x: isAdmin ? 520 : 20,
    y: 20,
    title: isAdmin ? 'Kamba Online - Admin' : 'Kamba Online - Cliente',
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: '#F5EDE0',
    autoHideMenuBar: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url); // e.g. WhatsApp links open in the normal browser
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`http://127.0.0.1:${running?.port}`)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
  win.on('page-title-updated', (e) => e.preventDefault()); // keep our window title
  win.loadURL(urlFor(which));
  return win;
}

function openCustomer() {
  if (customerWin && !customerWin.isDestroyed()) return customerWin.focus();
  customerWin = makeWindow('customer');
}

function openAdmin() {
  if (adminWin && !adminWin.isDestroyed()) return adminWin.focus();
  adminWin = makeWindow('admin');
}

function reloadAll() {
  for (const [win, which] of [[customerWin, 'customer'], [adminWin, 'admin']]) {
    if (win && !win.isDestroyed()) win.loadURL(urlFor(which));
  }
}

async function resetData({ demo }) {
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['Cancelar / Cancel', 'Apagar tudo / Delete everything'],
    defaultId: 0,
    cancelId: 0,
    title: demo ? 'Reset test data' : 'Start clean',
    message: demo
      ? 'Apagar tudo e repor os produtos de exemplo?'
      : 'Apagar tudo e começar do zero, sem produtos de exemplo?',
    detail:
      (demo
        ? 'Delete all orders, accounts, staff, photos and settings, and go back to the sample products and shops.'
        : 'Delete ALL data: products, shops, orders, accounts, staff, photos and settings. You start with an empty shop and the owner login (admin / kamba2026).') +
      '\n\nThis cannot be undone.',
  });
  if (response !== 1) return;
  await stopBackend();
  for (const suffix of ['', '-wal', '-shm', '-journal']) fs.rmSync(dbFile() + suffix, { force: true });
  fs.rmSync(uploadsDir(), { recursive: true, force: true });
  await startBackend({ demo });
  for (const win of [customerWin, adminWin]) {
    if (win && !win.isDestroyed()) {
      await win.webContents.session.clearStorageData();
    }
  }
  reloadAll();
}

// ---------- online updates (GitHub Releases) ----------

let manualCheck = false;
let updateReady = false;

function setupUpdates() {
  if (!app.isPackaged) return; // only the installed app updates itself
  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true; // never interrupts work: installs when the app is closed

  autoUpdater.on('update-available', (info) => {
    if (manualCheck) {
      dialog.showMessageBox({ type: 'info', message: `Nova versao ${info.version} encontrada.`, detail: 'A descarregar em segundo plano. / Downloading in the background.' });
    }
  });
  autoUpdater.on('update-not-available', () => {
    if (manualCheck) dialog.showMessageBox({ type: 'info', message: 'Kamba Online esta atualizado.', detail: `Version ${app.getVersion()} - up to date.` });
    manualCheck = false;
  });
  autoUpdater.on('error', (err) => {
    if (manualCheck) dialog.showErrorBox('Kamba Online', `Could not check for updates: ${err && err.message ? err.message : err}`);
    manualCheck = false;
  });
  autoUpdater.on('update-downloaded', async (info) => {
    updateReady = true;
    manualCheck = false;
    const { response } = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Reiniciar agora / Restart now', 'Mais tarde / Later'],
      defaultId: 1,
      cancelId: 1,
      message: `Versao ${info.version} pronta. / Version ${info.version} is ready.`,
      detail: 'Os seus dados ficam guardados. Se escolher "Mais tarde", instala quando fechar o Kamba Online. / Your data is kept. If you choose "Later" it installs when you close Kamba Online.',
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });

  const check = () => autoUpdater.checkForUpdates().catch(() => undefined);
  setTimeout(check, 15_000);
  setInterval(() => !updateReady && check(), 4 * 60 * 60 * 1000);
}

function checkForUpdatesNow() {
  if (!app.isPackaged) {
    dialog.showMessageBox({ type: 'info', message: 'Updates only work in the installed app.' });
    return;
  }
  if (updateReady) {
    require('electron-updater').autoUpdater.quitAndInstall();
    return;
  }
  manualCheck = true;
  require('electron-updater').autoUpdater.checkForUpdates().catch((err) => {
    manualCheck = false;
    dialog.showErrorBox('Kamba Online', `Could not check for updates: ${err && err.message ? err.message : err}`);
  });
}

function buildMenu() {
  const template = [
    {
      label: 'Kamba Online',
      submenu: [
        { label: 'Cliente / Customer window', accelerator: 'CmdOrCtrl+1', click: openCustomer },
        { label: 'Admin window', accelerator: 'CmdOrCtrl+2', click: openAdmin },
        { type: 'separator' },
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => BrowserWindow.getFocusedWindow()?.reload() },
        { label: 'Open data folder', click: () => shell.openPath(app.getPath('userData')) },
        { label: 'Reset test data (sample products)...', click: () => resetData({ demo: true }) },
        { label: 'Start clean (no sample data, for real data)...', click: () => resetData({ demo: false }) },
        { type: 'separator' },
        { label: `Check for updates... (version ${app.getVersion()})`, click: checkForUpdatesNow },
        { type: 'separator' },
        { role: 'quit', label: 'Quit' },
      ],
    },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }, { type: 'separator' }, { role: 'toggleDevTools' }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    openCustomer();
    openAdmin();
  });

  app.whenReady().then(async () => {
    try {
      await startBackend();
    } catch (err) {
      dialog.showErrorBox('Kamba Online', `Could not start: ${err && err.message ? err.message : err}`);
      app.quit();
      return;
    }
    buildMenu();
    openCustomer();
    openAdmin();
    setupUpdates();
  });

  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    if (running) {
      try {
        running.server.close();
        running.db.close();
      } catch {
        /* ignore */
      }
      running = null;
    }
  });
}
