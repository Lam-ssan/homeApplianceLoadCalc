@echo off
REM HomeApplianceLoadCalc - one-click commit and push to GitHub
cd /d "D:\homeApplianceLoadCalc" || exit /b 1

git add -A
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "update: %date% %time%"
) else (
  echo No changes, pushing...
)

git push origin main
echo.
echo Done.
pause
