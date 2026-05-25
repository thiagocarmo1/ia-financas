@echo off
title Polly e Thi Finance - Iniciando...

echo.
echo  ================================================
echo   Polly e Thi Finance - Iniciando Sistema...
echo  ================================================
echo.

:: Caminho do projeto
cd /d "C:\Users\thiag\.gemini\antigravity\scratch\ia-financas"

:: Iniciar o servidor Node.js em segundo plano
echo  [1/2] Iniciando servidor...
start "Polly e Thi - Servidor" cmd /k "node server.js"

:: Aguardar 2 segundos para o servidor subir
timeout /t 2 /nobreak >nul

:: Iniciar o ngrok com dominio FIXO (URL sempre a mesma!)
echo  [2/2] Iniciando URL publica fixa...
start "Polly e Thi - URL Publica" cmd /k "ngrok http 3000 --domain=reputable-whooping-uniformly.ngrok-free.dev"

echo.
echo  ================================================
echo   Sistema iniciado com sucesso!
echo.
echo   URL PUBLICA FIXA:
echo   https://reputable-whooping-uniformly.ngrok-free.dev
echo  ================================================
echo.
timeout /t 4 /nobreak >nul
