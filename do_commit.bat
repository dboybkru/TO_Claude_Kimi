@echo off
chcp 65001 > nul
cd /d "D:\git\Claude\TO_Claude"
git add -A
git commit -m "feat: contract 10944505 compliance — print forms, API, model fields"
git push
echo EXIT_CODE: %ERRORLEVEL%
