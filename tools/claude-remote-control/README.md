# Claude Code Remote Control auf einem Raspberry Pi

Richtet `claude remote-control` als systemd-User-Service ein, damit eine lokal auf
dem Pi laufende Claude-Code-Session von claude.ai/code oder der Claude-App aus
gesteuert werden kann. Code, Dateisystem und Ausführung bleiben auf dem Pi.

## Verwendung

Auf dem Pi ausführen:

```bash
./setup-claude-remote.sh [--at-boot-only] [PROJEKT_VERZEICHNIS] [SESSION_NAME]
```

Mit `--at-boot-only` wird der Dienst nur aktiviert, aber nicht sofort gestartet. Das
ist der richtige Weg, wenn im selben Verzeichnis bereits eine Claude-Sitzung laeuft:
der Dienst kommt erst beim naechsten Neustart hoch, wenn diese ohnehin beendet ist,
und es laufen nie zwei Instanzen gleichzeitig im selben Projekt.

Voreinstellung: `~/stadtkalender` und `Kalender Pi`.

Das Skript prüft Vorbedingungen (Login, Plan-Berechtigung, störende Umgebungs-
variablen), setzt den Workspace-Trust für das Projektverzeichnis, legt Launcher
und systemd-Unit an, aktiviert Linger für den Start ohne Login und nach Reboot,
startet den Service und gibt die Session-URL aus.

## Voraussetzungen

- Claude Code im `PATH`, angemeldet über `/login` (Pro, Max, Team oder Enterprise;
  API-Keys werden nicht unterstützt)
- `ANTHROPIC_BASE_URL` nicht gesetzt
- `DISABLE_TELEMETRY`, `DO_NOT_TRACK`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`
  und `DISABLE_GROWTHBOOK` nicht gesetzt
- systemd und `script` aus util-linux

## Verwaltung

```bash
systemctl --user status  claude-remote     # Status
journalctl  --user -u    claude-remote -f  # Log inklusive Session-URL
systemctl --user restart claude-remote     # Neustart
systemctl --user disable --now claude-remote   # Entfernen
```
