@echo off
powershell -Command "Restart-Service %1 -Force"
