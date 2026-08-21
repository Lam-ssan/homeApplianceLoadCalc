@echo off
REM Push to Gitee - HomeApplianceLoadCalc
cd /d "D:\homeApplianceLoadCalc" || exit /b 1

git add -A
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "update: %date% %time%"
) else (
  echo No changes, pushing...
)

git push -u gitee main
echo.
echo Done.
pause
