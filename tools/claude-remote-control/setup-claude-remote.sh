#!/usr/bin/env bash
# Richtet Claude Code Remote Control auf dem Raspberry Pi ein: als systemd-User-Service,
# der die Sitzung innerhalb von tmux startet, damit sie sowohl Neustarts uebersteht als
# auch weiterhin per 'tmux attach' im Terminal erreichbar bleibt.
#
# Aufruf:  ./setup-claude-remote.sh [--at-boot-only] [PROJEKT_VERZEICHNIS] [SESSION_NAME]
#
#   --at-boot-only  Dienst nur aktivieren, nicht sofort starten. Nuetzlich, wenn im
#                   selben Verzeichnis schon eine Claude-Sitzung laeuft: der Dienst
#                   kommt dann erst beim naechsten Neustart hoch, wenn diese ohnehin
#                   beendet ist, und es laufen nie zwei Instanzen gleichzeitig.
set -euo pipefail

START_NOW=1
if [ "${1:-}" = "--at-boot-only" ]; then START_NOW=0; shift; fi

PROJECT_DIR="${1:-$HOME/stadtkalender}"
SESSION_NAME="${2:-Stadtkalender Pi}"
TMUX_SESSION="${TMUX_SESSION:-kalender}"
SERVICE_NAME="claude-remote"
UNIT_DIR="$HOME/.config/systemd/user"
SERVICE_LAUNCHER="$HOME/.local/bin/claude-remote-launch"
USER_LAUNCHER="${USER_LAUNCHER:-$HOME/kalender}"

say()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m  %s\n' "$*"; }
die()  { printf '\033[1;31mXX\033[0m  %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- 1. Vorbedingungen
say "Prüfe Vorbedingungen"

if [ -e "$PROJECT_DIR" ] && [ ! -d "$PROJECT_DIR" ]; then
  die "'$PROJECT_DIR' existiert, ist aber kein Verzeichnis (sondern $(file -b "$PROJECT_DIR" 2>/dev/null || echo Datei)).
      Gib das echte Projektverzeichnis an, z.B.:  $0 ~/stadtkalender"
fi
[ -d "$PROJECT_DIR" ] || die "Projektverzeichnis '$PROJECT_DIR' existiert nicht."
PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"

command -v claude >/dev/null 2>&1 || die "'claude' ist nicht im PATH. Erst Claude Code installieren."
command -v tmux   >/dev/null 2>&1 || die "'tmux' fehlt: sudo apt install tmux"
command -v systemctl >/dev/null 2>&1 || die "systemd nicht gefunden."

# Symlink NICHT aufloesen: bei npm-Installationen zeigt er auf eine cli.js tief in
# node_modules, deren Verzeichnis kein 'node' enthaelt - der Service startet dann nicht.
CLAUDE_BIN="$(command -v claude)"
CLAUDE_DIR="$(cd "$(dirname "$CLAUDE_BIN")" && pwd)"
TMUX_BIN="$(command -v tmux)"
say "claude: $CLAUDE_BIN ($(claude --version 2>/dev/null | head -1))"
say "tmux:   $TMUX_BIN"

SERVICE_PATH="$CLAUDE_DIR"
if NODE_BIN="$(command -v node 2>/dev/null)"; then
  NODE_DIR="$(cd "$(dirname "$NODE_BIN")" && pwd)"
  [ "$NODE_DIR" = "$CLAUDE_DIR" ] || SERVICE_PATH="$SERVICE_PATH:$NODE_DIR"
  say "node:   $NODE_BIN"
else
  warn "'node' nicht im PATH - ok bei nativer Installation, Fehler bei npm-Installation."
fi
SERVICE_PATH="$SERVICE_PATH:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"

[ -z "${ANTHROPIC_BASE_URL:-}" ] || warn "ANTHROPIC_BASE_URL ist gesetzt ('$ANTHROPIC_BASE_URL') - Remote Control funktioniert damit NICHT. Bitte entfernen."
for v in DISABLE_TELEMETRY DO_NOT_TRACK CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC DISABLE_GROWTHBOOK; do
  [ -z "${!v:-}" ] || warn "$v ist gesetzt - das deaktiviert die Feature-Flag-Auswertung, die Remote Control braucht. Bitte entfernen."
done

# ---------------------------------------------------------------- 2. Login / Berechtigung
say "Prüfe Login und Plan-Berechtigung"
if ! "$CLAUDE_BIN" remote-control --help >/dev/null 2>&1; then
  die "Kein berechtigter Login. Führe aus:  cd '$PROJECT_DIR' && claude   ->  /login
      (Pro/Max/Team/Enterprise nötig; API-Keys werden nicht unterstützt.)"
fi
env -i HOME="$HOME" PATH="$SERVICE_PATH" TERM=xterm-256color \
    "$CLAUDE_BIN" --version >/dev/null 2>&1 \
  || die "claude läuft nicht mit PATH=$SERVICE_PATH - der Service würde ebenfalls scheitern."
say "Berechtigung und Start-Test ok"

# ---------------------------------------------------------------- 3. Workspace-Trust
say "Setze Workspace-Trust für $PROJECT_DIR"
python3 - "$PROJECT_DIR" <<'PY'
import json, os, sys, tempfile
path = os.path.expanduser("~/.claude.json")
proj = sys.argv[1]
data = {}
if os.path.exists(path):
    try:
        with open(path) as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        print("   ~/.claude.json unlesbar - Trust-Dialog erscheint beim ersten Start.")
        sys.exit(0)
    with open(path + ".bak", "w") as f:
        json.dump(data, f, indent=2)
entry = data.setdefault("projects", {}).setdefault(proj, {})
if entry.get("hasTrustDialogAccepted"):
    print("   war bereits gesetzt")
else:
    entry["hasTrustDialogAccepted"] = True
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path) or ".")
    with os.fdopen(fd, "w") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, path)
    os.chmod(path, 0o600)
    print("   gesetzt")
PY

# ---------------------------------------------------------------- 4. Dienst-Launcher
# tmux stellt selbst eine Pseudo-TTY bereit, deshalb ist hier kein 'script' noetig.
# Die Warteschleife haelt den Dienst aktiv, solange die tmux-Sitzung lebt; endet sie,
# beendet sich der Launcher und systemd startet ihn per Restart=always neu.
say "Schreibe Dienst-Launcher $SERVICE_LAUNCHER"
mkdir -p "$(dirname "$SERVICE_LAUNCHER")"
{
  echo '#!/usr/bin/env bash'
  echo 'set -euo pipefail'
  printf 'TMUX_BIN=%q\n'  "$TMUX_BIN"
  printf 'SESSION=%q\n'   "$TMUX_SESSION"
  printf 'DIR=%q\n'       "$PROJECT_DIR"
  printf 'CMD=%q\n'       "$(printf '%q remote-control --name %q' "$CLAUDE_BIN" "$SESSION_NAME")"
  cat <<'BODY'

if ! "$TMUX_BIN" has-session -t "$SESSION" 2>/dev/null; then
  "$TMUX_BIN" new-session -d -s "$SESSION" -c "$DIR" "$CMD"
fi

# Im Vordergrund bleiben, solange die Sitzung existiert - sonst haelt systemd den
# Dienst fuer beendet, weil 'tmux new-session -d' sofort zurueckkehrt.
while "$TMUX_BIN" has-session -t "$SESSION" 2>/dev/null; do
  sleep 5
done
BODY
} > "$SERVICE_LAUNCHER"
chmod 755 "$SERVICE_LAUNCHER"

# ---------------------------------------------------------------- 5. systemd-Unit
say "Schreibe systemd-Unit $UNIT_DIR/$SERVICE_NAME.service"
mkdir -p "$UNIT_DIR"
cat > "$UNIT_DIR/$SERVICE_NAME.service" <<UNIT_EOF
[Unit]
Description=Claude Code Remote Control ($SESSION_NAME) in tmux-Sitzung '$TMUX_SESSION'
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$PROJECT_DIR
Environment=PATH=$SERVICE_PATH
Environment=TERM=xterm-256color
ExecStart=$SERVICE_LAUNCHER
ExecStop=-$TMUX_BIN kill-session -t $TMUX_SESSION
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
UNIT_EOF

# ---------------------------------------------------------------- 6. Benutzer-Launcher
say "Passe Launcher $USER_LAUNCHER an"
if [ -e "$USER_LAUNCHER" ]; then
  BACKUP="$USER_LAUNCHER.bak-$(date +%Y%m%d-%H%M%S)"
  cp -p "$USER_LAUNCHER" "$BACKUP"
  say "   alte Fassung gesichert: $BACKUP"
fi
{
  echo '#!/usr/bin/env bash'
  echo '# Haengt sich an die Claude-Sitzung an, die der systemd-Dienst claude-remote betreibt.'
  echo 'set -euo pipefail'
  printf 'SESSION=%q\n' "$TMUX_SESSION"
  printf 'SERVICE=%q\n' "$SERVICE_NAME"
  cat <<'BODY'

if tmux has-session -t "$SESSION" 2>/dev/null; then
  exec tmux attach -t "$SESSION"
fi

echo "Die tmux-Sitzung '$SESSION' läuft nicht."
echo
systemctl --user status "$SERVICE" --no-pager || true
echo
echo "Dienst starten mit:   systemctl --user start $SERVICE"
echo "Log ansehen mit:      journalctl --user -u $SERVICE -n 50 --no-pager"
exit 1
BODY
} > "$USER_LAUNCHER"
chmod 755 "$USER_LAUNCHER"

# ---------------------------------------------------------------- 7. Aktivieren
say "Aktiviere Linger (Dienst läuft ohne aktiven Login und nach Reboot)"
loginctl enable-linger "$USER" 2>/dev/null || warn "enable-linger fehlgeschlagen - evtl. 'sudo loginctl enable-linger $USER' nötig."

systemctl --user daemon-reload

if [ "$START_NOW" = "0" ]; then
  systemctl --user enable "$SERVICE_NAME.service"
  printf '\n\033[1;32mFertig.\033[0m Der Dienst ist aktiviert, aber noch nicht gestartet.\n'
  echo "Er kommt beim nächsten Neustart des Pi von selbst hoch."
  echo
  echo "Sofort starten, sobald keine andere Sitzung mehr in $PROJECT_DIR läuft:"
  echo "    systemctl --user start $SERVICE_NAME"
else
  say "Starte Dienst"
  systemctl --user enable --now "$SERVICE_NAME.service"

  say "Warte auf Session-URL (max. 90s)"
  URL=""
  for _ in $(seq 1 90); do
    URL="$("$TMUX_BIN" capture-pane -p -S -200 -t "$TMUX_SESSION:0.0" 2>/dev/null \
           | grep -oE 'https://claude\.ai/code/[A-Za-z0-9_-]+' | tail -1 || true)"
    [ -n "$URL" ] && break
    systemctl --user is-active --quiet "$SERVICE_NAME.service" || break
    sleep 1
  done

  echo
  if [ -n "$URL" ]; then
    printf '\033[1;32mFertig.\033[0m Session-URL:\n\n    %s\n\n' "$URL"
    echo "Im Browser öffnen, oder unter claude.ai/code die Sitzung wählen: $SESSION_NAME"
  else
    warn "Keine URL gefunden. Zustand prüfen mit:"
    echo "    systemctl --user status $SERVICE_NAME"
    echo "    tmux capture-pane -p -t $TMUX_SESSION:0.0 | tail -30"
  fi
fi

cat <<INFO

Verwaltung:
  Anhängen   $USER_LAUNCHER          (oder: tmux attach -t $TMUX_SESSION)
  Ablösen    Ctrl-b d                (Sitzung läuft weiter)
  Status     systemctl --user status $SERVICE_NAME
  Log        journalctl --user -u $SERVICE_NAME -n 50 --no-pager
  Neustart   systemctl --user restart $SERVICE_NAME
  Stoppen    systemctl --user stop $SERVICE_NAME
  Entfernen  systemctl --user disable --now $SERVICE_NAME && rm $UNIT_DIR/$SERVICE_NAME.service $SERVICE_LAUNCHER
INFO
