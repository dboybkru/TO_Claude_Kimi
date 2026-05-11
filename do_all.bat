@echo off
cd /d "D:\git\Claude\TO_Claude"
del /f /q ".git\index.lock" 2>nul
git add -A
if %ERRORLEVEL% NEQ 0 (
  del /f /q ".git\index.lock" 2>nul
  git add -A
)
del /f /q ".git\index.lock" 2>nul
git commit -m "feat: contract 10944505 compliance"
del /f /q ".git\index.lock" 2>nul
git push github master
echo FINAL: %ERRORLEVEL%
