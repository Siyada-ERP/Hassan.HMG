@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js مش متسطّب. نزّل النسخة 22 او احدث من https://nodejs.org وبعدين شغّل الملف ده تاني.
  pause
  exit /b 1
)
if not exist "public\index.html" if exist "..\scripts\build.js" (
  echo اول مرة: جارٍ بناء صفحة التطبيق ...
  node ..\scripts\build.js
)
echo جارٍ تشغيل SIYADA ... افتح المتصفح على http://localhost:3000
echo لإيقاف السيرفر اقفل النافذة دي.
node server.js
pause
