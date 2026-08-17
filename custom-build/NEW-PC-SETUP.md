# Setting up Custom Mixxx on a new PC (development)

How to continue **developing** this build on another Windows machine. Everything
is on the fork, so nothing gets lost — you clone the source and rebuild rather
than copying the huge (regenerable) build folders.

> Just want to **run** the app, not build it? Use the portable release instead:
> <https://github.com/Humpeldibumpel/mixxx/releases/tag/custom-2.7-stems>

---

## 1. Install these first

- **Git**
- **Python 3.12 (x64)** — needed for the stem tools
- **Visual Studio 2022 or newer** with the **"Desktop development with C++"**
  workload (this also provides CMake + Ninja)

## 2. Run the setup script

In PowerShell:

```powershell
iwr https://raw.githubusercontent.com/Humpeldibumpel/mixxx/custom-build/downbeats-2.7/custom-build/setup-newpc.ps1 -OutFile setup-newpc.ps1
powershell -ExecutionPolicy Bypass -File .\setup-newpc.ps1
```

The script (idempotent — safe to re-run):

- clones the fork to `C:\mixxx-build\mixxx` and checks out `custom-build/downbeats-2.7`
- wires up the git remotes: `fork` (yours), `origin` (upstream mixxxdj), `ronso0`, `alephlm`
- creates a **fresh** `stem-tools` venv and installs **demucs + CPU torch + numpy**
  (a fresh venv is far more reliable than copying one between PCs)
- downloads **ffmpeg** into `stem-tools\ffmpeg`
- copies the helper scripts (`build-mixxx.bat`, `make-portable.ps1`) into `C:\mixxx-build`

> Keep the default root `C:\mixxx-build`. The `.bat` helpers contain hard-coded
> `C:\mixxx-build` paths; a different root means editing them.

## 3. Manual steps the script can't do

1. **Set the Visual Studio path** in `C:\mixxx-build\build-mixxx.bat` — the line
   that calls `VsDevCmd.bat`. The script prints the detected path for you to paste.
2. *(Optional)* copy your personal **`config-isolated`** folder from the old PC to
   `C:\mixxx-build\config-isolated` — your test library, DDJ-RR mapping and
   settings. This is **not** in git. (Its library points at `C:\Alex\Musik\…`;
   adjust if the music lives elsewhere on the new PC.)
3. **Build:** run `C:\mixxx-build\build-mixxx.bat`. The first build downloads the
   `buildenv` dependencies and takes a while.

## 4. Notes

- The **Demucs model** (~80 MB) downloads automatically the first time you
  generate stems (needs internet once). After that it works offline.
- **Run the build:** `C:\mixxx-build\run-mixxx-custom.bat` (uses the isolated
  `config-isolated`, not your normal Mixxx profile).

## Everyday workflow (across both PCs)

- Before working: `git pull`
- After a change: `git add -A && git commit -m "…"` then `git push`
- On the other PC: `git pull` to get it

The library/settings (`config-isolated`) and the `stem-tools` environment stay
per-machine — only the source code syncs via git.
