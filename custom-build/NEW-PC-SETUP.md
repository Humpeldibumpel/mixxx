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

1. *(Optional)* copy your personal **`config-isolated`** folder from the old PC to
   `C:\mixxx-build\config-isolated` — your test library, DDJ-RR mapping and
   settings. This is **not** in git. (Its library points at `C:\Alex\Musik\…`;
   adjust if the music lives elsewhere on the new PC.)
2. **Build:** run `C:\mixxx-build\build-mixxx.bat`. It locates Visual Studio via
   `vswhere` on its own — set the `VSDEVCMD` environment variable only if you
   need to override that. The first build fetches the `buildenv` dependencies
   (~2 GB download, ~8 GB unpacked) and takes a while.

   > **Run the first build in an interactive console window.** With 7-Zip absent,
   > `tools\windows_buildenv.bat` unpacks the dependency archive through a nested
   > `powershell.exe`, and that nested process never starts when the build runs
   > detached with no console attached — it then sits at 0 % indefinitely instead
   > of failing. Installing **7-Zip** avoids the powershell path entirely and is
   > the more robust option if you build from a script or CI.

### Disk space

Budget about **20 GB free** on `C:` for the first build: ~8 GB unpacked
`buildenv`, ~2 GB for the archive until it is deleted after unpacking, and
~3.5 GB for the `RelWithDebInfo` build tree including PDBs.

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
