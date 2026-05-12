# Mixxx with Downbeat Highlights — Custom Build

An unofficial Mixxx build that adds a visible **downbeat marker** (every 4th
beat / start of each musical bar) to the waveform display, plus a handful of
fixes that make the feature actually work end-to-end.

> **Heads up:** this is a third-party fork. It is **not** an official Mixxx
> release and is not supported by the Mixxx team. For the official Mixxx,
> see [mixxxdj/mixxx](https://github.com/mixxxdj/mixxx) and
> [mixxx.org](https://mixxx.org).

---

## What this is

Mixxx 2.5 / 2.6 / 2.7 ship a single `<BeatColor>` for every beat on the
waveform — there is no built-in way to distinguish the downbeat (the "1"
of every bar) from the other three beats. The feature has been requested
since [2013](https://bugs.launchpad.net/mixxx/+bug/1128005) and several
upstream PRs over the years have stalled.

The most complete attempt is [alephlm's PR #14835][pr-14835] on the
`down-beats-clean` branch — a working proof-of-concept that has been
inactive since June 2025 and never landed.

This branch picks up that work, fixes four issues that prevented it from
being usable in practice, and packages it as a standalone build.

[pr-14835]: https://github.com/mixxxdj/mixxx/pull/14835

## What you get

- A coloured marker on every downbeat (every 4th beat by default) on the
  live waveform, in addition to the regular beat grid.
- A skin toggle to show or hide the downbeat markers at runtime — and
  the toggle state is remembered across restarts.
- Two skin buttons to shift the downbeat phase by one beat forward or
  back, in case the auto-detected "1" lands on the wrong beat.
- Tooltips on all three buttons.
- A separate fix for a 2.6 regression that hid the loop start/end icons
  on the live waveform under certain conditions (also submitted upstream
  as [#16449](https://github.com/mixxxdj/mixxx/pull/16449)).

## Base version

This branch is based on Mixxx **2.7-alpha** (upstream `main`), via
alephlm's `down-beats-clean` branch. It is **not** compatible with
Mixxx 2.5.x or 2.6.x library databases — first launch will upgrade
`mixxxdb.sqlite` to the newer schema, after which older Mixxx versions
will no longer be able to read it. If you want to keep using stable
Mixxx alongside this build, **start it with `--settingsPath` pointing
to a separate config directory** (see "Running" below).

## Commits on top of `down-beats-clean`

```
c6fcb997  waveform: connect mark position changes in setup(), not init()
efd4a030  skin/tooltips: add entries for the downbeat marker buttons
e04c0cb1  engine/bpmcontrol: register toggle_downbeats_marker ControlObject
79e92be3  allshader/waveform: default downbeat markers visible
```

Each commit fixes one independent issue:

1. **`79e92be3` — Default downbeat opacity 1.0 instead of 0.0.**
   alephlm's PR set the initial opacity to zero, so the markers were
   invisible on first run even when everything else was wired up.

2. **`e04c0cb1` — Register the `toggle_downbeats_marker` ControlObject.**
   The skin button and the waveform widget both connect to a CO named
   `toggle_downbeats_marker`, but nothing on the engine side ever
   created it. `ControlObject::getControl()` returned `nullptr` and the
   connect calls silently failed. Now it's a proper `ControlPushButton`
   in toggle mode with `persist=true`.

3. **`efd4a030` — Tooltips for the three downbeat buttons.**
   `toggle_downbeats_marker`, `beats_forward_down_beats_marker` and
   `beats_backward_down_beats_marker` were referenced by the LateNight
   skin but had no entries in `Tooltips::addStandardTooltips()`.

4. **`c6fcb997` — Move mark position connect calls into `setup()`.**
   Unrelated to downbeats, but uncovered while testing this branch.
   `WaveformRenderMarkBase::init()` runs before `setup()`; the connect
   calls in `init()` ran against an empty `m_marks` and never bound to
   the CO-driven loop start/end marks, so the loop ↻ icon was hidden
   until something triggered `Track::cuesUpdated`. This fix is also
   open as upstream PR [#16449](https://github.com/mixxxdj/mixxx/pull/16449).

## Building (Windows)

Same toolchain as upstream Mixxx — see the
[official Compiling on Windows guide](https://github.com/mixxxdj/mixxx/wiki/Compiling-on-Windows)
for the full setup (Visual Studio 2022, vcpkg, ninja, the Mixxx buildenv).

Then on this branch:

```powershell
git clone --branch custom-build/downbeats-2.7 https://github.com/Humpeldibumpel/mixxx.git
cd mixxx
# follow the upstream wiki to fetch the buildenv and configure cmake,
# then build with ninja in RelWithDebInfo or Release
```

## Running

This build is based on a development version of Mixxx that upgrades the
library database schema. **Do not point it at your stable Mixxx config
directory** unless you are ready to commit to this build — once the
schema is upgraded, your stable Mixxx will refuse to read the database.

Recommended: keep a separate config directory.

```powershell
.\mixxx.exe --settingsPath "C:\path\to\custom-config" --resourcePath "C:/path/to/mixxx/res"
```

Note: `--resourcePath` must use **forward slashes**. Backslashes silently
break the QSS skin stylesheet parser (icons disappear), because Qt's QSS
parser interprets `\m`, `\b`, `\r` etc. as escape sequences.

## Credits

- [**alephlm**](https://github.com/alephlm) — the original downbeat
  visualisation work in PR
  [#14835](https://github.com/mixxxdj/mixxx/pull/14835). This branch
  exists only because of that work. All design decisions for the
  downbeat feature itself are theirs.
- The [**Mixxx team and contributors**](https://github.com/mixxxdj/mixxx/graphs/contributors) —
  for Mixxx itself, which is one of the few pieces of free software
  that takes DJing seriously. Please consider
  [donating to the project](https://mixxx.org/donate) if you find this
  build useful.

## License

Mixxx is Copyright © 2000–2025 by its respective authors, distributed
under the **GNU General Public License version 2** as described in the
[LICENSE](LICENSE) and [COPYING](COPYING) files included with the
source.

This custom build is distributed under the same terms. The full
corresponding source code for any binary release built from this
branch is available in this repository at the branch tag matching the
release — that is the GPL-required source distribution.

## Disclaimer

This build is provided **as-is**, with no warranty of any kind. It is
not produced or endorsed by the Mixxx project. Bugs in this build
should be reported here, not to the Mixxx team; do not file issues
against `mixxxdj/mixxx` for behaviour that only happens on this
branch.
