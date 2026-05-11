@echo off
cd /d "D:\git\Claude\TO_Claude"
git push github master
echo PUSH_EXIT: %ERRORLEVEL%
