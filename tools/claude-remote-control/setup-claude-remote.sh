#!/usr/bin/env bash
# Richtet Claude Code Remote Control auf dem Raspberry Pi als systemd-User-Service ein.
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
SERVICE_NAME="claude-remote"
UNIT_DIR="$HOME/.config/systemd/user"
LAUNCHER="$HOME/.local/bin/claude-remote-launch"

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
# Symlink NICHT aufloesen: bei npm-Installationen zeigt er auf eine cli.js tief in
# node_modules, deren Verzeichnis kein 'node' enthaelt - der Service startet dann nicht.
CLAUDE_BIN="$(command -v claude)"
CLAUDE_DIR="$(cd "$(dirname "$CLAUDE_BIN")" && pwd)"
say "claude: $CLAUDE_BIN ($(claude --version 2>/dev/null | head -1))"

# PATH fuer die Unit: Verzeichnis von claude, dazu node (npm-Installationen brauchen es;
# native Installationen sind eigenstaendig und haben evtl. gar kein node).
SERVICE_PATH="$CLAUDE_DIR"
if NODE_BIN="$(command -v node 2>/dev/null)"; then
  NODE_DIR="$(cd "$(dirname "$NODE_BIN")" && pwd)"
  [ "$NODE_DIR" = "$CLAUDE_DIR" ] || SERVICE_PATH="$SERVICE_PATH:$NODE_DIR"
  say "node:   $NODE_BIN"
else
  warn "'node' nicht im PATH - ok bei nativer Installation, Fehler bei npm-Installation."
fi
SERVICE_PATH="$SERVICE_PATH:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"

command -v script  >/dev/null 2>&1 || die "'script' (util-linux) fehlt: sudo apt install bsdutils util-linux"
command -v systemctl >/dev/null 2>&1 || die "systemd nicht gefunden - nutze stattdessen die tmux-Variante."

# Remote Control braucht api.anthropic.com und aktive Feature-Flag-Auswertung
[ -z "${ANTHROPIC_BASE_URL:-}" ] || warn "ANTHROPIC_BASE_URL ist gesetzt ('$ANTHROPIC_BASE_URL') - Remote Control funktioniert damit NICHT. Bitte entfernen."
for v in DISABLE_TELEMETRY DO_NOT_TRACK CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC DISABLE_GROWTHBOOK; do
  [ -z "${!v:-}" ] || warn "$v ist gesetzt - das deaktiviert die Feature-Flag-Auswertung, die Remote Control braucht. Bitte entfernen."
done

# ---------------------------------------------------------------- 2. Login / Berechtigung
say "Prüfe Login und Plan-Berechtigung"
# 'claude remote-control --help' prüft die Berechtigung, bevor es die Hilfe ausgibt.
if ! "$CLAUDE_BIN" remote-control --help >/dev/null 2>&1; then
  die "Kein berechtigter Login. Führe aus:  cd '$PROJECT_DIR' && claude   ->  /login
      (Pro/Max/Team/Enterprise nötig; API-Keys werden nicht unterstützt.)"
fi
say "Berechtigung ok"

say "Teste Start mit dem PATH der Unit"
env -i HOME="$HOME" PATH="$SERVICE_PATH" TERM=xterm-256color \
    "$CLAUDE_BIN" --version >/dev/null 2>&1 \
  || die "claude laeuft nicht mit PATH=$SERVICE_PATH - der Service wuerde ebenfalls scheitern."
say "Start-Test ok"

# ---------------------------------------------------------------- 3. Workspace-Trust vorab setzen
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
    # Backup, bevor wir eine bestehende Konfiguration anfassen
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

# ---------------------------------------------------------------- 4. Launcher
say "Schreibe Launcher $LAUNCHER"
mkdir -p "$(dirname "$LAUNCHER")"
{
  echo '#!/usr/bin/env bash'
  echo 'set -euo pipefail'
  printf 'cd %q\n' "$PROJECT_DIR"
  # script -qec haengt eine Pseudo-TTY an, damit die TUI auch unter systemd startet
  printf 'exec script -qec %q /dev/null\n' \
    "$(printf '%q remote-control --name %q' "$CLAUDE_BIN" "$SESSION_NAME")"
} > "$LAUNCHER"
chmod 755 "$LAUNCHER"

# ---------------------------------------------------------------- 5. systemd-Unit
say "Schreibe systemd-Unit $UNIT_DIR/$SERVICE_NAME.service"
mkdir -p "$UNIT_DIR"
cat > "$UNIT_DIR/$SERVICE_NAME.service" <<UNIT_EOF
[Unit]
Description=Claude Code Remote Control ($SESSION_NAME)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$PROJECT_DIR
Environment=PATH=$SERVICE_PATH
Environment=TERM=xterm-256color
Environment=CLAUDE_REMOTE_CONTROL_SESSION_NAME_PREFIX=%H
ExecStart=$LAUNCHER
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
UNIT_EOF

# ---------------------------------------------------------------- 6. Starten
say "Aktiviere Linger (Service läuft ohne aktiven Login und nach Reboot)"
loginctl enable-linger "$USER" 2>/dev/null || warn "enable-linger fehlgeschlagen - evtl. 'sudo loginctl enable-linger $USER' nötig."

systemctl --user daemon-reload

if [ "$START_NOW" = "0" ]; then
  systemctl --user enable "$SERVICE_NAME.service"
  printf '\n\033[1;32mFertig.\033[0m Der Dienst ist aktiviert, aber noch nicht gestartet.\n'
  echo "Er kommt beim naechsten Neustart des Pi von selbst hoch."
  echo
  echo "Sofort starten, sobald keine andere Sitzung mehr im Projektverzeichnis laeuft:"
  echo "    systemctl --user start $SERVICE_NAME && journalctl --user -u $SERVICE_NAME -f"
else
  say "Starte Service"
  systemctl --user enable --now "$SERVICE_NAME.service"
fi

# ---------------------------------------------------------------- 7. Session-URL abwarten
if [ "$START_NOW" = "1" ]; then
say "Warte auf Session-URL (max. 90s)"
URL=""
for _ in $(seq 1 90); do
  URL="$(journalctl --user -u "$SERVICE_NAME.service" --since "-3min" --no-pager 2>/dev/null \
         | sed -e 's/\x1b\[[0-9;?]*[a-zA-Z]//g' -e 's/\r/\n/g' \
         | grep -oE 'https://claude\.ai/code/[A-Za-z0-9_-]+' | tail -1 || true)"
  [ -n "$URL" ] && break
  systemctl --user is-active --quiet "$SERVICE_NAME.service" || break
  sleep 1
done

echo
if [ -n "$URL" ]; then
  printf '\033[1;32mFertig.\033[0m Session-URL:\n\n    %s\n\n' "$URL"
  echo "Diese URL im Browser öffnen, oder die Session unter claude.ai/code"
  echo "bzw. in der Claude-App unter \"Code\" per Name auswählen: $SESSION_NAME"
else
  warn "Keine URL im Log gefunden. Status prüfen mit:"
  echo "    systemctl --user status $SERVICE_NAME"
  echo "    journalctl --user -u $SERVICE_NAME -n 60 --no-pager"
fi
fi

cat <<INFO

Verwaltung:
  Status    systemctl --user status $SERVICE_NAME
  Log/URL   journalctl --user -u $SERVICE_NAME -f
  Neustart  systemctl --user restart $SERVICE_NAME
  Stoppen   systemctl --user stop $SERVICE_NAME
  Entfernen systemctl --user disable --now $SERVICE_NAME && rm $UNIT_DIR/$SERVICE_NAME.service $LAUNCHER
INFO
