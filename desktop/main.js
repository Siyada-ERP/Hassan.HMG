'use strict';

const { app, BrowserWindow, dialog, shell } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.allowDowngrade = false;
autoUpdater.logger = require('electron-log');

function checkForUpdates() {
  if (!app.isPackaged) return;
  autoUpdater.logger.info('[updates] checking for updates');
  autoUpdater.checkForUpdates().catch(error => {
    autoUpdater.logger.error('[updates] check failed:', error);
    dialog.showErrorBox('تحديث SIYADA', 'تعذر التحقق من التحديثات:\n' + error.message);
  });
}

autoUpdater.on('update-available', async info => {
  const choice = await dialog.showMessageBox({
    type: 'info',
    buttons: ['تنزيل التحديث', 'لاحقًا'],
    defaultId: 0,
    cancelId: 1,
    title: 'تحديث SIYADA',
    message: 'يوجد إصدار جديد من SIYADA (' + info.version + '). هل تريد تنزيله الآن؟'
  });
  if (choice.response === 0) autoUpdater.downloadUpdate().catch(error => {
    dialog.showErrorBox('تحديث SIYADA', 'تعذر تنزيل التحديث: ' + error.message);
  });
});

autoUpdater.on('update-downloaded', async () => {
  const choice = await dialog.showMessageBox({
    type: 'info',
    buttons: ['إعادة التشغيل والتحديث', 'لاحقًا'],
    defaultId: 0,
    cancelId: 1,
    title: 'تحديث SIYADA جاهز',
    message: 'تم تنزيل التحديث. أعد تشغيل البرنامج لتثبيته.'
  });
  if (choice.response === 0) autoUpdater.quitAndInstall();
});

autoUpdater.on('download-progress', progress => {
  autoUpdater.logger.info('[updates] download', Math.round(progress.percent) + '%', progress.bytesPerSecond, progress.transferred, progress.total);
});

autoUpdater.on('error', error => {
  autoUpdater.logger.error('[updates] error:', error);
  dialog.showErrorBox('تحديث SIYADA', 'فشل تنزيل أو تثبيت التحديث:\n' + error.message);
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: 'SIYADA',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.loadFile(path.join(__dirname, '..', 'dist', 'SIYADA.html')).catch(error => {
    dialog.showErrorBox('SIYADA', 'تعذر تشغيل البرنامج: ' + error.message);
  });
}

app.whenReady().then(() => {
  createWindow();
  setTimeout(checkForUpdates, 3000);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
