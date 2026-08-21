# Claude Code Remote Control auf einem Raspberry Pi

Richtet `claude remote-control` als systemd-User-Service ein, damit eine lokal auf
dem Pi laufende Claude-Code-Sitzung von claude.ai/code oder der Claude-App aus
gesteuert werden kann. Code, Dateisystem und Ausführung bleiben auf dem Pi.

Der Dienst startet Claude **innerhalb einer tmux-Sitzung**. Dadurch übersteht die
Sitzung Neustarts des Pi und bleibt zugleich per `tmux attach` im Terminal
erreichbar. tmux stellt dabei auch die Pseudo-TTY bereit, die die TUI braucht.

## Verwendung

Auf dem Pi ausführen:

```bash
./setup-claude-remote.sh [--at-boot-only] [PROJEKT_VERZEICHNIS] [SESSION_NAME]
```

Voreinstellung: `~/stadtkalender` und `Stadtkalender Pi`.

Mit `--at-boot-only` wird der Dienst nur aktiviert, aber nicht sofort gestartet. Das
ist der richtige Weg, wenn im selben Verzeichnis bereits eine Claude-Sitzung läuft:
der Dienst kommt erst beim nächsten Neustart hoch, wenn diese ohnehin beendet ist,
und es laufen nie zwei Instanzen gleichzeitig im selben Projekt.

Zwei Umgebungsvariablen steuern die Namen: `TMUX_SESSION` (Vorgabe `kalender`) und
`USER_LAUNCHER` (Vorgabe `~/kalender`).

## Was das Skript anlegt

| Pfad | Zweck |
| --- | --- |
| `~/.config/systemd/user/claude-remote.service` | Die Unit. `Type=simple`, `Restart=always` |
| `~/.local/bin/claude-remote-launch` | Startet die tmux-Sitzung und bleibt im Vordergrund, solange sie lebt |
| `~/kalender` | Hängt sich an die Sitzung an; erklärt den Dienst-Zustand, wenn sie nicht läuft |

Eine vorhandene Datei unter `~/kalender` wird vor dem Überschreiben nach
`~/kalender.bak-JJJJMMTT-HHMMSS` gesichert.

## Voraussetzungen

- Claude Code im `PATH`, angemeldet über `/login` (Pro, Max, Team oder Enterprise;
  API-Keys werden nicht unterstützt)
- `ANTHROPIC_BASE_URL` nicht gesetzt
- `DISABLE_TELEMETRY`, `DO_NOT_TRACK`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`
  und `DISABLE_GROWTHBOOK` nicht gesetzt
- systemd und tmux

## Verwaltung

```bash
~/kalender                                      # anhängen (Ctrl-b d zum Ablösen)
systemctl --user status  claude-remote          # Status
journalctl  --user -u    claude-remote -n 50    # Log des Launchers
tmux capture-pane -p -t kalender:0.0 | tail -30 # Bildschirminhalt der Sitzung
systemctl --user restart claude-remote          # Neustart
systemctl --user disable --now claude-remote    # Entfernen
```

Die Session-URL steht im Bildschirminhalt der tmux-Sitzung, nicht im Journal — der
Dienst protokolliert nur den Launcher, die TUI läuft innerhalb von tmux.
