////////////////////////////////////////////////////////////////////////
// JSHint configuration                                               //
////////////////////////////////////////////////////////////////////////
/* global engine                                                      */
/* global script                                                      */
/* global midi                                                        */
/* global bpm                                                         */
/* global components                                                  */
////////////////////////////////////////////////////////////////////////
var PioneerDDJRR = function() {};

/*
	Original Author: DJMaxergy
	Adapted for DDJ-RR by: Claude (Anthropic)
	Version: 		1.19-RR, adapted for Pioneer DDJ-RR
	Description: 	Pioneer DDJ-RR Controller Mapping for Mixxx
	                Adapted from DDJ-SX mapping. Key fixes:
	                - SLIP button (note 0x17) now correctly triggers slip_enabled
	                  (DDJ-SX used this note for VINYL toggle -> caused random scratch breakage)
	                - SLIP REVERSE button (note 0x40) now triggers reverseRoll
	                  (DDJ-SX used this note for SLIP)
	                - Scratch mode is always ON by default (no VINYL button on DDJ-RR)
    Source: 		http://github.com/DJMaxergy/mixxx/tree/pioneerDDJSX_mapping

    Copyright (c) 2018 DJMaxergy, licensed under GPL version 2 or later
    Copyright (c) 2014-2015 various contributors, base for this mapping, licensed under MIT license

    Contributors:
    - Michael Stahl (DG3NEC): original DDJ-SB2 mapping for Mixxx 2.0
    - Sophia Herzog: midiAutoDJ-scripts
    - Joan Ardiaca Jové (joan.ardiaca@gmail.com): Pioneer DDJ-SB mapping for Mixxx 2.0
    - wingcom (wwingcomm@gmail.com): start of Pioneer DDJ-SB mapping
      https://github.com/wingcom/Mixxx-Pioneer-DDJ-SB
    - Hilton Rudham: Pioneer DDJ-SR mapping
      https://github.com/hrudham/Mixxx-Pioneer-DDJ-SR

    GPL license notice for current version:
    This program is free software; you can redistribute it and/or modify it under the terms of the
    GNU General Public License as published by the Free Software Foundation; either version 2
    of the License, or (at your option) any later version.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
    without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See
    the GNU General Public License for more details.

    You should have received a copy of the GNU General Public License along with this program; if
    not, write to the Free Software Foundation, Inc.,
    51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.


    MIT License for earlier versions:
    Permission is hereby granted, free of charge, to any person obtaining a copy of this software
    and associated documentation files (the "Software"), to deal in the Software without
    restriction, including without limitation the rights to use, copy, modify, merge, publish,
    distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
    Software is furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all copies or
    substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
    BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
    NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
    DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

///////////////////////////////////////////////////////////////
//                       USER OPTIONS                        //
///////////////////////////////////////////////////////////////

// Sets the jogwheels sensitivity. 1 is default, 2 is twice as sensitive, 0.5 is half as sensitive.
PioneerDDJRR.jogwheelSensitivity = 1;

// Sets how much more sensitive the jogwheels get when holding shift.
// Set to 1 to disable jogwheel sensitivity increase when holding shift (default: 10).
PioneerDDJRR.jogwheelShiftMultiplier = 10;

// If true, vu meters twinkle if AutoDJ is enabled (default: true).
PioneerDDJRR.twinkleVumeterAutodjOn = true;
// If true, selected track will be added to AutoDJ queue-top on pressing shift + rotary selector,
// else track will be added to AutoDJ queue-bottom (default: false).
PioneerDDJRR.autoDJAddTop = false;
// Sets the duration of sleeping between AutoDJ actions if AutoDJ is enabled [ms] (default: 1000).
PioneerDDJRR.autoDJTickInterval = 1000;
// Sets the maximum adjustment of BPM allowed for beats to sync if AutoDJ is enabled [BPM] (default: 10).
PioneerDDJRR.autoDJMaxBpmAdjustment = 10;
// If true, AutoDJ queue is being shuffled after skipping a track (default: false).
// When using a fixed set of tracks without manual intervention, some tracks may be unreachable,
// due to having an unfortunate place in the queue ordering. This solves the issue.
PioneerDDJRR.autoDJShuffleAfterSkip = false;

// If true, by releasing rotary selector,
// track in preview player jumps forward to "jumpPreviewPosition"
// (default: jumpPreviewEnabled = true, jumpPreviewPosition = 0.3).
PioneerDDJRR.jumpPreviewEnabled = true;
PioneerDDJRR.jumpPreviewPosition = 0.3;

// If true, pad press in SAMPLER-PAD-MODE repeatedly causes sampler to play
// loaded track from cue-point, else it causes to play loaded track from the beginning (default: false).
PioneerDDJRR.samplerCueGotoAndPlay = false;

// If true, PFL / Cue (headphone) is being activated by loading a track into certain deck (default: true).
PioneerDDJRR.autoPFL = true;


///////////////////////////////////////////////////////////////
//               INIT, SHUTDOWN & GLOBAL HELPER              //
///////////////////////////////////////////////////////////////

PioneerDDJRR.shiftPressed = false;
PioneerDDJRR.rotarySelectorChanged = false;
PioneerDDJRR.panels = [false, false]; // view state of effect and sampler panel
PioneerDDJRR.shiftPanelSelectPressed = false;

PioneerDDJRR.syncRate = [0, 0, 0, 0];
PioneerDDJRR.gridAdjustSelected = [false, false, false, false];
PioneerDDJRR.gridSlideSelected = [false, false, false, false];
PioneerDDJRR.needleSearchTouched = [false, false, false, false];
PioneerDDJRR.chFaderStart = [null, null, null, null];
PioneerDDJRR.toggledBrake = [false, false, false, false];
PioneerDDJRR.scratchMode = [true, true, true, true];
PioneerDDJRR.stopScratchTimer = [null, null, null, null];
// True while the jog top (touch sensor) is physically held. Used to suppress
// the no-vinyl auto-stop timer: a held platter should keep scratching and be
// ended by the touch-release path (like vinyl mode), not cut off ~80ms after
// the last tick. Set in jogTouch so it tracks the physical touch state in any
// jog mode; only consulted on the no-vinyl (CC 0x23) tick path.
PioneerDDJRR.jogTouchHeld = [false, false, false, false];
// True while the platter is still spinning down after touch release. Used to
// route ring-edge inertia ticks to scratchTick (no-op after scratchDisable)
// instead of pitchBendFromJog, which would otherwise cause an unwanted slow
// pitch-bend equal to manual outer-edge spinning.
PioneerDDJRR.postReleaseInertia = [false, false, false, false];
PioneerDDJRR.postReleaseInertiaTimer = [null, null, null, null];
// Loop-endpoint adjust mode: while LOOP IN / LOOP OUT is held, jog-wheel ticks
// nudge loop_start_position / loop_end_position instead of scratching/pitch-
// bending the deck. Mirrors rekordbox behaviour. See loopInButton/loopOutButton
// and the jog-tick handlers.
PioneerDDJRR.loopInHeld = [false, false, false, false];
PioneerDDJRR.loopOutHeld = [false, false, false, false];
PioneerDDJRR.loopInDidJog = [false, false, false, false];
PioneerDDJRR.loopOutDidJog = [false, false, false, false];
// True when loop_in / loop_out was already fired on press (because no loop was
// active yet). The release handler checks this so it does not fire the point a
// second time and push it forward.
PioneerDDJRR.loopInSetOnPress = [false, false, false, false];
PioneerDDJRR.loopOutSetOnPress = [false, false, false, false];
// Samples shifted per jog tick during loop-endpoint adjust. Lower = finer.
PioneerDDJRR.loopAdjustSamplesPerTick = 200;
// Hotcue press behaviour (hotCueLongPressMs = long-press threshold in ms):
//  - Empty slot  -> press sets a new hotcue at the current play position.
//  - Regular cue -> press jumps to the cue (hotcue_X_goto) immediately.
//  - Saved loop  -> SHORT press jumps to the loop start AND activates the loop
//                   (hotcue_X_gotoandloop), LONG press toggles/activates the
//                   loop in place without jumping (hotcue_X_activate).
// Any press on a *set* hotcue also starts playback if the deck is paused.
PioneerDDJRR.hotCueLongPressMs = 1000;
PioneerDDJRR.hotCuePressTimer = [null, null, null, null];
PioneerDDJRR.hotCuePressIndex = [-1, -1, -1, -1];
PioneerDDJRR.wheelLedsBlinkStatus = [0, 0, 0, 0];
PioneerDDJRR.wheelLedsPosition = [0, 0, 0, 0];
PioneerDDJRR.setUpSpeedSliderRange = [0.08, 0.08, 0.08, 0.08];

// PAD mode storage:
PioneerDDJRR.padModes = {
    'hotCue': 0,
    'loopRoll': 1,
    'slicer': 2,
    'sampler': 3,
    'group1': 4,
    'beatloop': 5,
    'group3': 6,
    'group4': 7
};
PioneerDDJRR.activePadMode = [
    PioneerDDJRR.padModes.hotCue,
    PioneerDDJRR.padModes.hotCue,
    PioneerDDJRR.padModes.hotCue,
    PioneerDDJRR.padModes.hotCue
];
PioneerDDJRR.samplerVelocityMode = [false, false, false, false];

// FX storage:
PioneerDDJRR.fxKnobMSBValue = [0, 0];
PioneerDDJRR.shiftFxKnobMSBValue = [0, 0];

// used for advanced auto dj features:
PioneerDDJRR.blinkAutodjState = false;
PioneerDDJRR.autoDJTickTimer = 0;
PioneerDDJRR.autoDJSyncBPM = false;
PioneerDDJRR.autoDJSyncKey = false;

// used for PAD parameter selection:
PioneerDDJRR.selectedSamplerBank = 0;
PioneerDDJRR.selectedLoopParam = [0, 0, 0, 0];
PioneerDDJRR.selectedLoopRollParam = [2, 2, 2, 2];
PioneerDDJRR.selectedLoopIntervals = [
    [1 / 4, 1 / 2, 1, 2, 4, 8, 16, 32],
    [1 / 4, 1 / 2, 1, 2, 4, 8, 16, 32],
    [1 / 4, 1 / 2, 1, 2, 4, 8, 16, 32],
    [1 / 4, 1 / 2, 1, 2, 4, 8, 16, 32]
];
PioneerDDJRR.selectedLooprollIntervals = [
    [1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8],
    [1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8],
    [1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8],
    [1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8]
];
PioneerDDJRR.loopIntervals = [
    [1 / 4, 1 / 2, 1, 2, 4, 8, 16, 32],
    [1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8, 16],
    [1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8],
    [1 / 32, 1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4]
];
PioneerDDJRR.selectedSlicerQuantizeParam = [1, 1, 1, 1];
PioneerDDJRR.selectedSlicerQuantization = [1 / 4, 1 / 4, 1 / 4, 1 / 4];
PioneerDDJRR.slicerQuantizations = [1 / 8, 1 / 4, 1 / 2, 1];
PioneerDDJRR.selectedSlicerDomainParam = [0, 0, 0, 0];
PioneerDDJRR.selectedSlicerDomain = [8, 8, 8, 8];
PioneerDDJRR.slicerDomains = [8, 16, 32, 64];

// slicer storage:
PioneerDDJRR.slicerBeatsPassed = [0, 0, 0, 0];
PioneerDDJRR.slicerPreviousBeatsPassed = [0, 0, 0, 0];
PioneerDDJRR.slicerActive = [false, false, false, false];
PioneerDDJRR.slicerAlreadyJumped = [false, false, false, false];
PioneerDDJRR.slicerButton = [0, 0, 0, 0];
PioneerDDJRR.slicerModes = {
    'contSlice': 0,
    'loopSlice': 1
};
PioneerDDJRR.activeSlicerMode = [
    PioneerDDJRR.slicerModes.contSlice,
    PioneerDDJRR.slicerModes.contSlice,
    PioneerDDJRR.slicerModes.contSlice,
    PioneerDDJRR.slicerModes.contSlice
];


PioneerDDJRR.init = function(id) {
    PioneerDDJRR.scratchSettings = {
        'alpha': 1.0 / 8,
        'beta': 1.0 / 8 / 32,
        'jogResolution': 900,
        'vinylSpeed': 33 + 1 / 3,
    };

    PioneerDDJRR.channelGroups = {
        '[Channel1]': 0x00,
        '[Channel2]': 0x01,
        '[Channel3]': 0x02,
        '[Channel4]': 0x03
    };

    PioneerDDJRR.samplerGroups = {
        '[Sampler1]': 0x00,
        '[Sampler2]': 0x01,
        '[Sampler3]': 0x02,
        '[Sampler4]': 0x03,
        '[Sampler5]': 0x04,
        '[Sampler6]': 0x05,
        '[Sampler7]': 0x06,
        '[Sampler8]': 0x07
    };

    PioneerDDJRR.fxUnitGroups = {
        '[EffectRack1_EffectUnit1]': 0x00,
        '[EffectRack1_EffectUnit2]': 0x01,
        '[EffectRack1_EffectUnit3]': 0x02,
        '[EffectRack1_EffectUnit4]': 0x03
    };

    PioneerDDJRR.fxEffectGroups = {
        '[EffectRack1_EffectUnit1_Effect1]': 0x00,
        '[EffectRack1_EffectUnit1_Effect2]': 0x01,
        '[EffectRack1_EffectUnit1_Effect3]': 0x02,
        '[EffectRack1_EffectUnit2_Effect1]': 0x00,
        '[EffectRack1_EffectUnit2_Effect2]': 0x01,
        '[EffectRack1_EffectUnit2_Effect3]': 0x02
    };

    PioneerDDJRR.ledGroups = {
        'hotCue': 0x00,
        'loopRoll': 0x10,
        'slicer': 0x20,
        'sampler': 0x30,
        'group1': 0x40,
        'group2': 0x50,
        'group3': 0x60,
        'group4': 0x70
    };

    PioneerDDJRR.nonPadLeds = {
        'headphoneCue': 0x54,
        'shiftHeadphoneCue': 0x68,
        'cue': 0x0C,
        'shiftCue': 0x48,
        'keyLock': 0x1A,
        'shiftKeyLock': 0x60,
        'play': 0x0B,
        'shiftPlay': 0x47,
        'vinyl': 0x0D,
        'sync': 0x58,
        'shiftSync': 0x5C,
        'autoLoop': 0x14,
        'shiftAutoLoop': 0x50,
        'loopHalve': 0x12,
        'shiftLoopHalve': 0x61,
        'loopDouble': 0x13,
        'shiftLoopDouble': 0x62,
        'loopIn': 0x10,
        'shiftLoopIn': 0x4C,
        'loopOut': 0x11,
        'shiftLoopOut': 0x4D,
        'censor': 0x15,
        'shiftCensor': 0x38,
        'slip': 0x40,
        'shiftSlip': 0x63,
        'gridAdjust': 0x79,
        'shiftGridAdjust': 0x64,
        'gridSlide': 0x0A,
        'shiftGridSlide': 0x65,
        'takeoverPlus': 0x34,
        'takeoverMinus': 0x37,
        'fx1on': 0x47,
        'shiftFx1on': 0x63,
        'fx2on': 0x48,
        'shiftFx2on': 0x64,
        'fx3on': 0x49,
        'shiftFx3on': 0x65,
        'fxTab': 0x4A,
        'shiftFxTab': 0x66,
        'fx1assignDeck1': 0x4C,
        'shiftFx1assignDeck1': 0x70,
        'fx1assignDeck2': 0x4D,
        'shiftFx1assignDeck2': 0x71,
        'fx1assignDeck3': 0x4E,
        'shiftFx1assignDeck3': 0x72,
        'fx1assignDeck4': 0x4F,
        'shiftFx1assignDeck4': 0x73,
        'fx2assignDeck1': 0x50,
        'shiftFx2assignDeck1': 0x54,
        'fx2assignDeck2': 0x51,
        'shiftFx2assignDeck2': 0x55,
        'fx2assignDeck3': 0x52,
        'shiftFx2assignDeck3': 0x56,
        'fx2assignDeck4': 0x53,
        'shiftFx2assignDeck4': 0x57,
        'masterCue': 0x63,
        'shiftMasterCue': 0x62,
        'loadDeck1': 0x46,
        'shiftLoadDeck1': 0x58,
        'loadDeck2': 0x47,
        'shiftLoadDeck2': 0x59,
        'loadDeck3': 0x48,
        'shiftLoadDeck3': 0x60,
        'loadDeck4': 0x49,
        'shiftLoadDeck4': 0x61,
        'hotCueMode': 0x1B,
        'shiftHotCueMode': 0x69,
        'rollMode': 0x1E,
        'shiftRollMode': 0x6B,
        'slicerMode': 0x20,
        'shiftSlicerMode': 0x6D,
        'samplerMode': 0x22,
        'shiftSamplerMode': 0x6F,
        'longPressSamplerMode': 0x41,
        'parameterLeftHotCueMode': 0x24,
        'shiftParameterLeftHotCueMode': 0x01,
        'parameterLeftRollMode': 0x25,
        'shiftParameterLeftRollMode': 0x02,
        'parameterLeftSlicerMode': 0x26,
        'shiftParameterLeftSlicerMode': 0x03,
        'parameterLeftSamplerMode': 0x27,
        'shiftParameterLeftSamplerMode': 0x04,
        'parameterLeftGroup1Mode': 0x28,
        'shiftParameterLeftGroup1Mode': 0x05,
        'parameterLeftGroup2Mode': 0x29,
        'shiftParameterLeftGroup2Mode': 0x06,
        'parameterLeftGroup3Mode': 0x2A,
        'shiftParameterLeftGroup3Mode': 0x07,
        'parameterLeftGroup4Mode': 0x2B,
        'shiftParameterLeftGroup4Mode': 0x08,
        'parameterRightHotCueMode': 0x2C,
        'shiftParameterRightHotCueMode': 0x09,
        'parameterRightRollMode': 0x2D,
        'shiftParameterRightRollMode': 0x7A,
        'parameterRightSlicerMode': 0x2E,
        'shiftParameterRightSlicerMode': 0x7B,
        'parameterRightSamplerMode': 0x2F,
        'shiftParameterRightSamplerMode': 0x7C,
        'parameterRightGroup1Mode': 0x30,
        'shiftParameterRightGroup1Mode': 0x7D,
        'parameterRightGroup2Mode': 0x31,
        'shiftParameterRightGroup2Mode': 0x7E,
        'parameterRightGroup3Mode': 0x32,
        'shiftParameterRightGroup3Mode': 0x7F,
        'parameterRightGroup4Mode': 0x33,
        'shiftParameterRightGroup4Mode': 0x00
    };

    PioneerDDJRR.illuminationControl = {
        'loadedDeck1': 0x00,
        'loadedDeck2': 0x01,
        'loadedDeck3': 0x02,
        'loadedDeck4': 0x03,
        'unknownDeck1': 0x04,
        'unknownDeck2': 0x05,
        'unknownDeck3': 0x06,
        'unknownDeck4': 0x07,
        'playPauseDeck1': 0x0C,
        'playPauseDeck2': 0x0D,
        'playPauseDeck3': 0x0E,
        'playPauseDeck4': 0x0F,
        'cueDeck1': 0x10,
        'cueDeck2': 0x11,
        'cueDeck3': 0x12,
        'cueDeck4': 0x13,
        'djAppConnect': 0x09
    };

    PioneerDDJRR.wheelLedCircle = {
        'minVal': 0x00,
        'maxVal': 0x48
    };

    PioneerDDJRR.valueVuMeter = {
        '[Channel1]_current': 0,
        '[Channel2]_current': 0,
        '[Channel3]_current': 0,
        '[Channel4]_current': 0,
        '[Channel1]_enabled': 1,
        '[Channel2]_enabled': 1,
        '[Channel3]_enabled': 1,
        '[Channel4]_enabled': 1
    };

    // set 32 Samplers as default:
    if (engine.getValue("[App]", "num_samplers") < 32) {
        engine.setValue("[App]", "num_samplers", 32);
    }

    // activate vu meter timer for Auto DJ:
    if (PioneerDDJRR.twinkleVumeterAutodjOn) {
        PioneerDDJRR.vuMeterTimer = engine.beginTimer(200, PioneerDDJRR.vuMeterTwinkle);
    }

    // initiate control status request:
    midi.sendShortMsg(0x9B, 0x08, 0x7F);

    // bind controls and init deck parameters:
    PioneerDDJRR.bindNonDeckControlConnections(true);
    for (var index in PioneerDDJRR.channelGroups) {
        if (PioneerDDJRR.channelGroups.hasOwnProperty(index)) {
            PioneerDDJRR.initDeck(index);
        }
    }

    // init effects section:
    PioneerDDJRR.effectUnit = [];
    PioneerDDJRR.effectUnit[1] = new components.EffectUnit([1, 3]);
    PioneerDDJRR.effectUnit[2] = new components.EffectUnit([2, 4]);
    PioneerDDJRR.effectUnit[1].enableButtons[1].midi = [0x94, PioneerDDJRR.nonPadLeds.fx1on];
    PioneerDDJRR.effectUnit[1].enableButtons[2].midi = [0x94, PioneerDDJRR.nonPadLeds.fx2on];
    PioneerDDJRR.effectUnit[1].enableButtons[3].midi = [0x94, PioneerDDJRR.nonPadLeds.fx3on];
    PioneerDDJRR.effectUnit[1].effectFocusButton.midi = [0x94, PioneerDDJRR.nonPadLeds.fxTab];
    PioneerDDJRR.effectUnit[1].dryWetKnob.input = function(channel, control, value, status, group) {
        this.inSetParameter(this.inGetParameter() + PioneerDDJRR.getRotaryDelta(value) / 30);
    };
    PioneerDDJRR.effectUnit[1].init();
    PioneerDDJRR.effectUnit[2].enableButtons[1].midi = [0x95, PioneerDDJRR.nonPadLeds.fx1on];
    PioneerDDJRR.effectUnit[2].enableButtons[2].midi = [0x95, PioneerDDJRR.nonPadLeds.fx2on];
    PioneerDDJRR.effectUnit[2].enableButtons[3].midi = [0x95, PioneerDDJRR.nonPadLeds.fx3on];
    PioneerDDJRR.effectUnit[2].effectFocusButton.midi = [0x95, PioneerDDJRR.nonPadLeds.fxTab];
    PioneerDDJRR.effectUnit[2].dryWetKnob.input = function(channel, control, value, status, group) {
        this.inSetParameter(this.inGetParameter() + PioneerDDJRR.getRotaryDelta(value) / 30);
    };
    PioneerDDJRR.effectUnit[2].init();
};

PioneerDDJRR.shutdown = function() {
    PioneerDDJRR.resetDeck("[Channel1]");
    PioneerDDJRR.resetDeck("[Channel2]");
    PioneerDDJRR.resetDeck("[Channel3]");
    PioneerDDJRR.resetDeck("[Channel4]");

    PioneerDDJRR.resetNonDeckLeds();
};


///////////////////////////////////////////////////////////////
//                      VU - METER                           //
///////////////////////////////////////////////////////////////

PioneerDDJRR.vuMeterTwinkle = function() {
    if (engine.getValue("[AutoDJ]", "enabled")) {
        PioneerDDJRR.blinkAutodjState = !PioneerDDJRR.blinkAutodjState;
    }
    PioneerDDJRR.valueVuMeter["[Channel1]_enabled"] = PioneerDDJRR.blinkAutodjState ? 1 : 0;
    PioneerDDJRR.valueVuMeter["[Channel3]_enabled"] = PioneerDDJRR.blinkAutodjState ? 1 : 0;
    PioneerDDJRR.valueVuMeter["[Channel2]_enabled"] = PioneerDDJRR.blinkAutodjState ? 1 : 0;
    PioneerDDJRR.valueVuMeter["[Channel4]_enabled"] = PioneerDDJRR.blinkAutodjState ? 1 : 0;
};


///////////////////////////////////////////////////////////////
//                        AUTO DJ                            //
///////////////////////////////////////////////////////////////

PioneerDDJRR.autodjToggle = function(channel, control, value, status, group) {
    if (value) {
        script.toggleControl("[AutoDJ]", "enabled");
    }
};

PioneerDDJRR.autoDJToggleSyncBPM = function(channel, control, value, status, group) {
    if (value) {
        PioneerDDJRR.autoDJSyncBPM = !PioneerDDJRR.autoDJSyncBPM;
        PioneerDDJRR.generalLedControl(PioneerDDJRR.nonPadLeds.shiftLoadDeck1, PioneerDDJRR.autoDJSyncBPM);
    }
};

PioneerDDJRR.autoDJToggleSyncKey = function(channel, control, value, status, group) {
    if (value) {
        PioneerDDJRR.autoDJSyncKey = !PioneerDDJRR.autoDJSyncKey;
        PioneerDDJRR.generalLedControl(PioneerDDJRR.nonPadLeds.shiftLoadDeck2, PioneerDDJRR.autoDJSyncKey);
    }
};

PioneerDDJRR.autoDJTimer = function(value, group, control) {
    if (value) {
        PioneerDDJRR.autoDJTickTimer = engine.beginTimer(PioneerDDJRR.autoDJTickInterval, PioneerDDJRR.autoDJControl);
    } else if (PioneerDDJRR.autoDJTickTimer) {
        engine.stopTimer(PioneerDDJRR.autoDJTickTimer);
        PioneerDDJRR.autoDJTickTimer = 0;
    }
    engine.setValue("[Channel1]", "quantize", value);
    engine.setValue("[Channel2]", "quantize", value);
};

PioneerDDJRR.autoDJControl = function() {
    var prev = 1,
        next = 2,
        prevPos = 0,
        nextPos = 0,
        nextPlaying = 0,
        prevBpm = 0,
        nextBpm = 0,
        diffBpm = 0,
        diffBpmDouble = 0,
        keyOkay = 0,
        prevKey = 0,
        nextKey = 0,
        diffKey = 0;

    if (!PioneerDDJRR.autoDJSyncBPM && !PioneerDDJRR.autoDJSyncKey) {
        return;
    }

    prevPos = engine.getValue("[Channel" + prev + "]", "playposition");
    nextPos = engine.getValue("[Channel" + next + "]", "playposition");
    if (prevPos < nextPos) {
        var tmp = nextPos;
        nextPos = prevPos;
        prevPos = tmp;
        next = 1;
        prev = 2;
    }
    nextPlaying = engine.getValue("[Channel" + next + "]", "play_indicator");
    prevBpm = engine.getValue("[Channel" + prev + "]", "visual_bpm");
    nextBpm = engine.getValue("[Channel" + next + "]", "visual_bpm");
    diffBpm = Math.abs(nextBpm - prevBpm);
    // diffBpm, with bpm of ONE track doubled
    // Note: Where appropriate, Mixxx will automatically match two beats of one.
    if (nextBpm < prevBpm) {
        diffBpmDouble = Math.abs(2 * nextBpm - prevBpm);
    } else {
        diffBpmDouble = Math.abs(2 * prevBpm - nextBpm);
    }

    // Next track is playing --> Fade in progress
    // Note: play_indicator is falsely true, when analysis is needed and similar
    if (nextPlaying && (nextPos > 0.0)) {
        // Bpm synced up --> disable sync before new track loaded
        // Note: Sometimes, Mixxx does not sync close enough for === operator
        if (diffBpm < 0.01 || diffBpmDouble < 0.01) {
            engine.setValue("[Channel" + prev + "]", "sync_mode", 0.0);
            engine.setValue("[Channel" + next + "]", "sync_mode", 0.0);
        } else { // Synchronize
            engine.setValue("[Channel" + prev + "]", "sync_mode", 1.0); // First,  set prev to follower
            engine.setValue("[Channel" + next + "]", "sync_mode", 2.0); // Second, set next to master
        }

        // Only adjust key when approaching the middle of fading
        if (PioneerDDJRR.autoDJSyncKey) {
            var diffFader = Math.abs(engine.getValue("[Master]", "crossfader") - 0.5);
            if (diffFader < 0.25) {
                nextKey = engine.getValue("[Channel" + next + "]", "key");
                engine.setValue("[Channel" + prev + "]", "key", nextKey);
            }
        }
    } else if (!nextPlaying) { // Next track is stopped --> Disable sync and refine track selection
        // First, disable sync; should be off by now, anyway
        engine.setValue("[Channel" + prev + "]", "sync_mode", 0.0); // Disable sync, else loading new track...
        engine.setValue("[Channel" + next + "]", "sync_mode", 0.0); // ...or skipping tracks would break things.

        // Second, refine track selection
        var skip = 0;
        if (diffBpm > PioneerDDJRR.autoDJMaxBpmAdjustment && diffBpmDouble > PioneerDDJRR.autoDJMaxBpmAdjustment) {
            skip = 1;
        }
        // Mixing in key:
        //     1  the difference is exactly 12 (harmonic switch of tonality), or
        //     2  both are of same tonality, and
        //     2a difference is 0, 1 or 2 (difference of up to two semitones: equal key or energy mix)
        //     2b difference corresponds to neighbours in the circle of fifth (harmonic neighbours)
        //   If neither is the case, we skip.
        if (PioneerDDJRR.autoDJSyncKey) {
            keyOkay = 0;
            prevKey = engine.getValue("[Channel" + prev + "]", "visual_key");
            nextKey = engine.getValue("[Channel" + next + "]", "visual_key");
            diffKey = Math.abs(prevKey - nextKey);
            if (diffKey === 12.0) {
                keyOkay = 1; // Switch of tonality
            }
            // Both of same tonality:
            if ((prevKey < 13 && nextKey < 13) || (prevKey > 12 && nextKey > 12)) {
                if (diffKey < 3.0) {
                    keyOkay = 1; // Equal or Energy
                }
                if (diffKey === 5.0 || diffKey === 7.0) {
                    keyOkay = 1; // Neighbours in Circle of Fifth
                }
            }
            if (!keyOkay) {
                skip = 1;
            }
        }

        if (skip) {
            engine.setValue("[AutoDJ]", "skip_next", 1.0);
            engine.setValue("[AutoDJ]", "skip_next", 0.0); // Have to reset manually
            if (PioneerDDJRR.autoDJShuffleAfterSkip) {
                engine.setValue("[AutoDJ]", "shuffle_playlist", 1.0);
                engine.setValue("[AutoDJ]", "shuffle_playlist", 0.0); // Have to reset manually
            }
        }
    }
};


///////////////////////////////////////////////////////////////
//                      CONTROL BINDING                      //
///////////////////////////////////////////////////////////////

PioneerDDJRR.bindDeckControlConnections = function(channelGroup, bind) {
    var i,
        index,
        deck = PioneerDDJRR.channelGroups[channelGroup],
        controlsToFunctions = {
            'play_indicator': 'PioneerDDJRR.playLed',
            'cue_indicator': 'PioneerDDJRR.cueLed',
            'playposition': 'PioneerDDJRR.wheelLeds',
            'pfl': 'PioneerDDJRR.headphoneCueLed',
            'bpm_tap': 'PioneerDDJRR.shiftHeadphoneCueLed',
            'VuMeter': 'PioneerDDJRR.VuMeterLeds',
            'keylock': 'PioneerDDJRR.keyLockLed',
            'slip_enabled': 'PioneerDDJRR.slipLed',
            'quantize': 'PioneerDDJRR.quantizeLed',
            'loop_in': 'PioneerDDJRR.loopInLed',
            'loop_out': 'PioneerDDJRR.loopOutLed',
            'loop_enabled': 'PioneerDDJRR.autoLoopLed',
            'loop_double': 'PioneerDDJRR.loopDoubleLed',
            'loop_halve': 'PioneerDDJRR.loopHalveLed',
            'reloop_andstop': 'PioneerDDJRR.shiftLoopInLed',
            'beatjump_1_forward': 'PioneerDDJRR.loopShiftFWLed',
            'beatjump_1_backward': 'PioneerDDJRR.loopShiftBKWLed',
            'beatjump_forward': 'PioneerDDJRR.hotCueParameterRightLed',
            'beatjump_backward': 'PioneerDDJRR.hotCueParameterLeftLed',
            'reverse': 'PioneerDDJRR.reverseLed',
            'duration': 'PioneerDDJRR.loadLed',
            'sync_enabled': 'PioneerDDJRR.syncLed',
            'beat_active': 'PioneerDDJRR.slicerBeatActive'
        };

    for (i = 1; i <= 8; i++) {
        controlsToFunctions["hotcue_" + i + "_enabled"] = "PioneerDDJRR.hotCueLeds";
    }

    for (index in PioneerDDJRR.selectedLoopIntervals[deck]) {
        if (PioneerDDJRR.selectedLoopIntervals[deck].hasOwnProperty(index)) {
            controlsToFunctions["beatloop_" + PioneerDDJRR.selectedLoopIntervals[deck][index] + "_enabled"] = "PioneerDDJRR.beatloopLeds";
        }
    }

    for (index in PioneerDDJRR.selectedLooprollIntervals[deck]) {
        if (PioneerDDJRR.selectedLooprollIntervals[deck].hasOwnProperty(index)) {
            controlsToFunctions["beatlooproll_" + PioneerDDJRR.selectedLooprollIntervals[deck][index] + "_activate"] = "PioneerDDJRR.beatlooprollLeds";
        }
    }

    script.bindConnections(channelGroup, controlsToFunctions, !bind);

    for (index in PioneerDDJRR.fxUnitGroups) {
        if (PioneerDDJRR.fxUnitGroups.hasOwnProperty(index)) {
            if (PioneerDDJRR.fxUnitGroups[index] < 2) {
                engine.connectControl(index, "group_" + channelGroup + "_enable", "PioneerDDJRR.fxAssignLeds", !bind);
                if (bind) {
                    engine.trigger(index, "group_" + channelGroup + "_enable");
                }
            }
        }
    }
};

PioneerDDJRR.bindNonDeckControlConnections = function(bind) {
    var index;

    for (index in PioneerDDJRR.samplerGroups) {
        if (PioneerDDJRR.samplerGroups.hasOwnProperty(index)) {
            engine.connectControl(index, "duration", "PioneerDDJRR.samplerLeds", !bind);
            engine.connectControl(index, "play", "PioneerDDJRR.samplerLedsPlay", !bind);
            if (bind) {
                engine.trigger(index, "duration");
            }
        }
    }

    engine.connectControl("[Master]", "headSplit", "PioneerDDJRR.shiftMasterCueLed", !bind);
    if (bind) {
        engine.trigger("[Master]", "headSplit");
    }

    engine.connectControl("[AutoDJ]", "enabled", "PioneerDDJRR.autoDJTimer", !bind);
};


///////////////////////////////////////////////////////////////
//                     DECK INIT / RESET                     //
///////////////////////////////////////////////////////////////

PioneerDDJRR.initDeck = function(group) {
    var deck = PioneerDDJRR.channelGroups[group];

    // save set up speed slider range from the Mixxx settings, but only if
    // it looks like a sane default (< 0.85). If Mixxx persisted a high value
    // (e.g. user cycled to 0.90 in the previous session), the Shift+Keylock
    // cycle would otherwise be stuck — reset to 0.08 in that case.
    var initialRange = engine.getValue(group, "rateRange");
    PioneerDDJRR.setUpSpeedSliderRange[deck] = (initialRange < 0.85) ? initialRange : 0.08;

    PioneerDDJRR.bindDeckControlConnections(group, true);

    PioneerDDJRR.updateParameterStatusLeds(
        group,
        PioneerDDJRR.selectedLoopRollParam[deck],
        PioneerDDJRR.selectedLoopParam[deck],
        PioneerDDJRR.selectedSamplerBank,
        PioneerDDJRR.selectedSlicerQuantizeParam[deck],
        PioneerDDJRR.selectedSlicerDomainParam[deck]
    );
    PioneerDDJRR.triggerVinylLed(deck);

    PioneerDDJRR.illuminateFunctionControl(
        PioneerDDJRR.illuminationControl["loadedDeck" + (deck + 1)],
        false
    );
    PioneerDDJRR.illuminateFunctionControl(
        PioneerDDJRR.illuminationControl["unknownDeck" + (deck + 1)],
        false
    );
    PioneerDDJRR.wheelLedControl(group, PioneerDDJRR.wheelLedCircle.minVal);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.hotCueMode, true); // set HOT CUE Pad-Mode
};

PioneerDDJRR.resetDeck = function(group) {
    PioneerDDJRR.bindDeckControlConnections(group, false);

    PioneerDDJRR.VuMeterLeds(0x00, group, 0x00); // reset VU meter Leds
    PioneerDDJRR.wheelLedControl(group, PioneerDDJRR.wheelLedCircle.minVal); // reset jogwheel Leds
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.hotCueMode, true); // reset HOT CUE Pad-Mode
    // pad Leds:
    for (var i = 0; i < 8; i++) {
        PioneerDDJRR.padLedControl(group, PioneerDDJRR.ledGroups.hotCue, i, false, false);
        PioneerDDJRR.padLedControl(group, PioneerDDJRR.ledGroups.loopRoll, i, false, false);
        PioneerDDJRR.padLedControl(group, PioneerDDJRR.ledGroups.slicer, i, false, false);
        PioneerDDJRR.padLedControl(group, PioneerDDJRR.ledGroups.sampler, i, false, false);
        PioneerDDJRR.padLedControl(group, PioneerDDJRR.ledGroups.group2, i, false, false);
        PioneerDDJRR.padLedControl(group, PioneerDDJRR.ledGroups.hotCue, i, true, false);
        PioneerDDJRR.padLedControl(group, PioneerDDJRR.ledGroups.loopRoll, i, true, false);
        PioneerDDJRR.padLedControl(group, PioneerDDJRR.ledGroups.slicer, i, true, false);
        PioneerDDJRR.padLedControl(group, PioneerDDJRR.ledGroups.sampler, i, true, false);
        PioneerDDJRR.padLedControl(group, PioneerDDJRR.ledGroups.group2, i, true, false);
    }
    // non pad Leds:
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.headphoneCue, false);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.shiftHeadphoneCue, false);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.cue, false);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.shiftCue, false);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.keyLock, false);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.shiftKeyLock, false);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.play, false);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.shiftPlay, false);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.vinyl, false);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.sync, false);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.shiftSync, false);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.autoLoop, false);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.shiftAutoLoop, false);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.loopHalve, false);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.shiftLoopHalve, false);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.loopIn, false);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.shiftLoopIn, false);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.loopOut, false);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.shiftLoopOut, false);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.censor, false);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.shiftCensor, false);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.slip, false);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.shiftSlip, false);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.gridAdjust, false);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.shiftGridAdjust, false);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.gridSlide, false);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.shiftGridSlide, false);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.takeoverPlus, false);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.takeoverMinus, false);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.parameterLeftRollMode, false);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.parameterLeftSlicerMode, false);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.shiftParameterLeftSlicerMode, false);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.parameterLeftSamplerMode, false);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.parameterLeftGroup2Mode, false);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.parameterRightRollMode, false);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.parameterRightSlicerMode, false);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.shiftParameterRightSlicerMode, false);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.parameterRightSamplerMode, false);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.parameterRightGroup2Mode, false);
};


///////////////////////////////////////////////////////////////
//            HIGH RESOLUTION MIDI INPUT HANDLERS            //
///////////////////////////////////////////////////////////////

PioneerDDJRR.highResMSB = {
    '[Channel1]': {},
    '[Channel2]': {},
    '[Channel3]': {},
    '[Channel4]': {},
    '[Master]': {},
    '[Samplers]': {}
};

PioneerDDJRR.tempoSliderMSB = function(channel, control, value, status, group) {
    PioneerDDJRR.highResMSB[group].tempoSlider = value;
};

PioneerDDJRR.tempoSliderLSB = function(channel, control, value, status, group) {
    var fullValue = (PioneerDDJRR.highResMSB[group].tempoSlider << 7) + value,
        sliderRate = 1 - (fullValue / 0x3FFF),
        deck = PioneerDDJRR.channelGroups[group];

    engine.setParameter(group, "rate", sliderRate);

    if (PioneerDDJRR.syncRate[deck] !== 0) {
        if (PioneerDDJRR.syncRate[deck] !== engine.getValue(group, "rate")) {
            PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.takeoverPlus, 0);
            PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.takeoverMinus, 0);
            PioneerDDJRR.syncRate[deck] = 0;
        }
    }
};

PioneerDDJRR.gainKnobMSB = function(channel, control, value, status, group) {
    PioneerDDJRR.highResMSB[group].gainKnob = value;
};

PioneerDDJRR.gainKnobLSB = function(channel, control, value, status, group) {
    var fullValue = (PioneerDDJRR.highResMSB[group].gainKnob << 7) + value;
    engine.setParameter(group, "pregain", fullValue / 0x3FFF);
};

PioneerDDJRR.filterHighKnobMSB = function(channel, control, value, status, group) {
    PioneerDDJRR.highResMSB[group].filterHigh = value;
};

PioneerDDJRR.filterHighKnobLSB = function(channel, control, value, status, group) {
    var fullValue = (PioneerDDJRR.highResMSB[group].filterHigh << 7) + value;
    engine.setParameter("[EqualizerRack1_" + group + "_Effect1]", "parameter3", fullValue / 0x3FFF);
};

PioneerDDJRR.filterMidKnobMSB = function(channel, control, value, status, group) {
    PioneerDDJRR.highResMSB[group].filterMid = value;
};

PioneerDDJRR.filterMidKnobLSB = function(channel, control, value, status, group) {
    var fullValue = (PioneerDDJRR.highResMSB[group].filterMid << 7) + value;
    engine.setParameter("[EqualizerRack1_" + group + "_Effect1]", "parameter2", fullValue / 0x3FFF);
};

PioneerDDJRR.filterLowKnobMSB = function(channel, control, value, status, group) {
    PioneerDDJRR.highResMSB[group].filterLow = value;
};

PioneerDDJRR.filterLowKnobLSB = function(channel, control, value, status, group) {
    var fullValue = (PioneerDDJRR.highResMSB[group].filterLow << 7) + value;
    engine.setParameter("[EqualizerRack1_" + group + "_Effect1]", "parameter1", fullValue / 0x3FFF);
};

PioneerDDJRR.deckFaderMSB = function(channel, control, value, status, group) {
    PioneerDDJRR.highResMSB[group].deckFader = value;
};

PioneerDDJRR.deckFaderLSB = function(channel, control, value, status, group) {
    var fullValue = (PioneerDDJRR.highResMSB[group].deckFader << 7) + value;

    if (PioneerDDJRR.shiftPressed &&
        engine.getValue(group, "volume") === 0 &&
        fullValue !== 0 &&
        engine.getValue(group, "play") === 0
    ) {
        PioneerDDJRR.chFaderStart[channel] = engine.getValue(group, "playposition");
        engine.setValue(group, "play", 1);
    } else if (
        PioneerDDJRR.shiftPressed &&
        engine.getValue(group, "volume") !== 0 &&
        fullValue === 0 &&
        engine.getValue(group, "play") === 1 &&
        PioneerDDJRR.chFaderStart[channel] !== null
    ) {
        engine.setValue(group, "play", 0);
        engine.setValue(group, "playposition", PioneerDDJRR.chFaderStart[channel]);
        PioneerDDJRR.chFaderStart[channel] = null;
    }
    engine.setParameter(group, "volume", fullValue / 0x3FFF);
};

PioneerDDJRR.filterKnobMSB = function(channel, control, value, status, group) {
    PioneerDDJRR.highResMSB[group].filterKnob = value;
};

PioneerDDJRR.filterKnobLSB = function(channel, control, value, status, group) {
    var fullValue = (PioneerDDJRR.highResMSB[group].filterKnob << 7) + value;
    engine.setParameter("[QuickEffectRack1_" + group + "]", "super1", fullValue / 0x3FFF);
};

PioneerDDJRR.crossfaderCurveKnobMSB = function(channel, control, value, status, group) {
    PioneerDDJRR.highResMSB[group].crossfaderCurveKnob = value;
};

PioneerDDJRR.crossfaderCurveKnobLSB = function(channel, control, value, status, group) {
    var fullValue = (PioneerDDJRR.highResMSB[group].crossfaderCurveKnob << 7) + value;
    script.crossfaderCurve(fullValue, 0x00, 0x3FFF);
};

PioneerDDJRR.samplerVolumeFaderMSB = function(channel, control, value, status, group) {
    PioneerDDJRR.highResMSB[group].samplerVolumeFader = value;
};

PioneerDDJRR.samplerVolumeFaderLSB = function(channel, control, value, status, group) {
    var fullValue = (PioneerDDJRR.highResMSB[group].samplerVolumeFader << 7) + value;
    for (var i = 1; i <= 32; i++) {
        engine.setParameter("[Sampler" + i + "]", "volume", fullValue / 0x3FFF);
    }
};

PioneerDDJRR.crossFaderMSB = function(channel, control, value, status, group) {
    PioneerDDJRR.highResMSB[group].crossFader = value;
};

PioneerDDJRR.crossFaderLSB = function(channel, control, value, status, group) {
    var fullValue = (PioneerDDJRR.highResMSB[group].crossFader << 7) + value;
    engine.setParameter(group, "crossfader", fullValue / 0x3FFF);
};


///////////////////////////////////////////////////////////////
//           SINGLE MESSAGE MIDI INPUT HANDLERS              //
///////////////////////////////////////////////////////////////

PioneerDDJRR.shiftButton = function(channel, control, value, status, group) {
    var index = 0;
    PioneerDDJRR.shiftPressed = (value === 0x7F);
    for (index in PioneerDDJRR.chFaderStart) {
        if (typeof index === "number") {
            PioneerDDJRR.chFaderStart[index] = null;
        }
    }
    if (value) {
        PioneerDDJRR.effectUnit[1].shift();
        PioneerDDJRR.effectUnit[2].shift();
    }
    if (!value) {
        PioneerDDJRR.effectUnit[1].unshift();
        PioneerDDJRR.effectUnit[2].unshift();
    }
};

PioneerDDJRR.playButton = function(channel, control, value, status, group) {
    var deck = PioneerDDJRR.channelGroups[group],
        playing = engine.getValue(group, "play");

    if (value) {
        if (playing) {
            script.brake(channel, control, value, status, group);
            PioneerDDJRR.toggledBrake[deck] = true;
        } else {
            script.toggleControl(group, "play");
        }
    } else {
        if (PioneerDDJRR.toggledBrake[deck]) {
            script.brake(channel, control, value, status, group);
            script.toggleControl(group, "play");
            PioneerDDJRR.toggledBrake[deck] = false;
        }
    }
};

PioneerDDJRR.playStutterButton = function(channel, control, value, status, group) {
    engine.setValue(group, "play_stutter", value ? 1 : 0);
};

PioneerDDJRR.cueButton = function(channel, control, value, status, group) {
    script.toggleControl(group, "cue_default");
};

PioneerDDJRR.jumpToBeginningButton = function(channel, control, value, status, group) {
    script.toggleControl(group, "start_stop");
};

PioneerDDJRR.headphoneCueButton = function(channel, control, value, status, group) {
    if (value) {
        script.toggleControl(group, "pfl");
    }
};

PioneerDDJRR.bpmTapMeterButton = function(channel, control, value, status, group) {
    // Triggers the read-only bpm_tap_meter control (custom build, see
    // src/engine/controls/bpmcontrol.{h,cpp}). Does NOT overwrite track BPM
    // or rate, unlike Mixxx's native bpm.tapButton.
    if (value) {
        engine.setValue(group, "bpm_tap_meter", 1);
    }
};

PioneerDDJRR.headphoneSplitCueButton = function(channel, control, value, status, group) {
    if (value) {
        script.toggleControl(group, "headSplit");
    }
};

PioneerDDJRR.toggleHotCueMode = function(channel, control, value, status, group) {
    var deck = PioneerDDJRR.channelGroups[group];
    //HOTCUE
    if (value) {
        PioneerDDJRR.activePadMode[deck] = PioneerDDJRR.padModes.hotCue;
        PioneerDDJRR.activeSlicerMode[deck] = PioneerDDJRR.slicerModes.contSlice;
        PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.hotCueMode, value);
    }
};

PioneerDDJRR.toggleBeatloopRollMode = function(channel, control, value, status, group) {
    var deck = PioneerDDJRR.channelGroups[group];
    //ROLL
    if (value) {
        PioneerDDJRR.activePadMode[deck] = PioneerDDJRR.padModes.loopRoll;
        PioneerDDJRR.activeSlicerMode[deck] = PioneerDDJRR.slicerModes.contSlice;
        PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.rollMode, value);
    }
};

PioneerDDJRR.toggleSlicerMode = function(channel, control, value, status, group) {
    var deck = PioneerDDJRR.channelGroups[group];
    //SLICER
    if (value) {
        if (PioneerDDJRR.activePadMode[deck] === PioneerDDJRR.padModes.slicer &&
            PioneerDDJRR.activeSlicerMode[deck] === PioneerDDJRR.slicerModes.contSlice) {
            PioneerDDJRR.activeSlicerMode[deck] = PioneerDDJRR.slicerModes.loopSlice;
            engine.setValue(group, "slip_enabled", true);
        } else {
            PioneerDDJRR.activeSlicerMode[deck] = PioneerDDJRR.slicerModes.contSlice;
            engine.setValue(group, "slip_enabled", false);
        }
        PioneerDDJRR.activePadMode[deck] = PioneerDDJRR.padModes.slicer;
        PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.slicerMode, value);
    }
};

PioneerDDJRR.toggleSamplerMode = function(channel, control, value, status, group) {
    var deck = PioneerDDJRR.channelGroups[group];
    //SAMPLER
    if (value) {
        PioneerDDJRR.activePadMode[deck] = PioneerDDJRR.padModes.sampler;
        PioneerDDJRR.activeSlicerMode[deck] = PioneerDDJRR.slicerModes.contSlice;
        PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.samplerMode, value);
    }
};

PioneerDDJRR.toggleSamplerVelocityMode = function(channel, control, value, status, group) {
    var deck = PioneerDDJRR.channelGroups[group],
        index = 0;
    PioneerDDJRR.samplerVelocityMode[deck] = value ? true : false;
    if (value) {
        PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.longPressSamplerMode, value);
        for (index = 1; index <= 32; index++) {
            engine.setParameter("[Sampler" + index + "]", "volume", 0);
        }
    } else {
        for (index = 1; index <= 32; index++) {
            engine.setParameter("[Sampler" + index + "]", "volume", 1);
        }
    }
};

PioneerDDJRR.toggleBeatloopMode = function(channel, control, value, status, group) {
    var deck = PioneerDDJRR.channelGroups[group];
    //GROUP2
    if (value) {
        PioneerDDJRR.activePadMode[deck] = PioneerDDJRR.padModes.beatloop;
        PioneerDDJRR.activeSlicerMode[deck] = PioneerDDJRR.slicerModes.contSlice;
        PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.shiftRollMode, value);
    }
};

PioneerDDJRR.cancelHotCueLongPress = function(deck) {
    if (PioneerDDJRR.hotCuePressTimer[deck] !== null) {
        engine.stopTimer(PioneerDDJRR.hotCuePressTimer[deck]);
        PioneerDDJRR.hotCuePressTimer[deck] = null;
    }
    PioneerDDJRR.hotCuePressIndex[deck] = -1;
};

PioneerDDJRR.hotCueButtons = function(channel, control, value, status, group) {
    var deck = PioneerDDJRR.channelGroups[group];
    var index = control + 1;
    if (value) {
        // --- Press ---
        PioneerDDJRR.cancelHotCueLongPress(deck);
        var hotcueStatus = engine.getValue(group, "hotcue_" + index + "_status");
        if (hotcueStatus === 0) {
            // Empty slot: set a new hotcue at the current play position.
            // (No play change, no long-press logic.)
            engine.setValue(group, "hotcue_" + index + "_activate", 1);
            engine.setValue(group, "hotcue_" + index + "_activate", 0);
            return;
        }
        // Hotcue is set. CueType.Loop == 4 -> saved loop, anything else is a
        // regular cue.
        var isLoop = engine.getValue(group, "hotcue_" + index + "_type") === 4;
        if (!isLoop) {
            // Regular cue: jump there right away and make sure we are playing.
            engine.setValue(group, "hotcue_" + index + "_goto", 1);
            engine.setValue(group, "hotcue_" + index + "_goto", 0);
            if (engine.getValue(group, "play") === 0) {
                engine.setValue(group, "play", 1);
            }
            return;
        }
        // Saved loop: short vs long press is decided later. Arm the timer; the
        // jump (short press) happens on release, the activate (long press)
        // happens in the timer callback.
        PioneerDDJRR.hotCuePressIndex[deck] = index;
        var deckIdx = deck;
        var hotcueIdx = index;
        var hotcueGroup = group;
        PioneerDDJRR.hotCuePressTimer[deck] = engine.beginTimer(
            PioneerDDJRR.hotCueLongPressMs,
            function() {
                // Long press: arm/activate the saved loop and start playback.
                engine.setValue(hotcueGroup, "hotcue_" + hotcueIdx + "_activate", 1);
                engine.setValue(hotcueGroup, "hotcue_" + hotcueIdx + "_activate", 0);
                if (engine.getValue(hotcueGroup, "play") === 0) {
                    engine.setValue(hotcueGroup, "play", 1);
                }
                PioneerDDJRR.hotCuePressTimer[deckIdx] = null;
                PioneerDDJRR.hotCuePressIndex[deckIdx] = -1;
            },
            true
        );
    } else {
        // --- Release ---
        if (PioneerDDJRR.hotCuePressIndex[deck] === index) {
            // Released before the long-press timer fired -> short press ->
            // jump to the loop start, activate the loop and start playback.
            // hotcue_X_gotoandloop does all three (seek + enable saved loop +
            // start play if paused) in a single Mixxx control.
            PioneerDDJRR.cancelHotCueLongPress(deck);
            engine.setValue(group, "hotcue_" + index + "_gotoandloop", 1);
            engine.setValue(group, "hotcue_" + index + "_gotoandloop", 0);
        }
    }
};

PioneerDDJRR.clearHotCueButtons = function(channel, control, value, status, group) {
    var index = control - 0x08 + 1;
    script.toggleControl(group, "hotcue_" + index + "_clear");
};

PioneerDDJRR.beatloopButtons = function(channel, control, value, status, group) {
    var index = control - 0x50,
        deck = PioneerDDJRR.channelGroups[group];
    script.toggleControl(
        group,
        "beatloop_" + PioneerDDJRR.selectedLoopIntervals[deck][index] + "_toggle"
    );
};

PioneerDDJRR.slicerButtons = function(channel, control, value, status, group) {
    var index = control - 0x20,
        deck = PioneerDDJRR.channelGroups[group],
        domain = PioneerDDJRR.selectedSlicerDomain[deck],
        beatsToJump = 0;

    if (PioneerDDJRR.activeSlicerMode[deck] === PioneerDDJRR.slicerModes.loopSlice) {
        PioneerDDJRR.padLedControl(group, PioneerDDJRR.ledGroups.slicer, index, false, !value);
    } else {
        PioneerDDJRR.padLedControl(group, PioneerDDJRR.ledGroups.slicer, index, false, value);
    }
    PioneerDDJRR.slicerActive[deck] = value ? true : false;
    PioneerDDJRR.slicerButton[deck] = index;

    if (value) {
        beatsToJump = (PioneerDDJRR.slicerButton[deck] * (domain / 8)) - ((PioneerDDJRR.slicerBeatsPassed[deck] % domain) + 1);
        if (PioneerDDJRR.slicerButton[deck] === 0 && beatsToJump === -domain) {
            beatsToJump = 0;
        }
        if (PioneerDDJRR.slicerBeatsPassed[deck] >= Math.abs(beatsToJump) &&
            PioneerDDJRR.slicerPreviousBeatsPassed[deck] !== PioneerDDJRR.slicerBeatsPassed[deck]) {
            PioneerDDJRR.slicerPreviousBeatsPassed[deck] = PioneerDDJRR.slicerBeatsPassed[deck];
            if (Math.abs(beatsToJump) > 0) {
                engine.setValue(group, "beatjump", beatsToJump);
            }
        }
    }

    if (PioneerDDJRR.activeSlicerMode[deck] === PioneerDDJRR.slicerModes.contSlice) {
        engine.setValue(group, "slip_enabled", value);
        engine.setValue(group, "beatloop_size", PioneerDDJRR.selectedSlicerQuantization[deck]);
        engine.setValue(group, "beatloop_activate", value);
    }
};

PioneerDDJRR.beatloopRollButtons = function(channel, control, value, status, group) {
    var index = control - 0x10,
        deck = PioneerDDJRR.channelGroups[group];
    script.toggleControl(
        group,
        "beatlooproll_" + PioneerDDJRR.selectedLooprollIntervals[deck][index] + "_activate"
    );
};

PioneerDDJRR.samplerButtons = function(channel, control, value, status, group) {
    var index = control - 0x30 + 1,
        deckOffset = PioneerDDJRR.selectedSamplerBank * 8,
        sampleDeck = "[Sampler" + (index + deckOffset) + "]",
        playMode = PioneerDDJRR.samplerCueGotoAndPlay ? "cue_gotoandplay" : "start_play";

    if (engine.getValue(sampleDeck, "track_loaded")) {
        engine.setValue(sampleDeck, playMode, value ? 1 : 0);
    } else {
        engine.setValue(sampleDeck, "LoadSelectedTrack", value ? 1 : 0);
    }
};

PioneerDDJRR.stopSamplerButtons = function(channel, control, value, status, group) {
    var index = control - 0x38 + 1,
        deckOffset = PioneerDDJRR.selectedSamplerBank * 8,
        sampleDeck = "[Sampler" + (index + deckOffset) + "]",
        trackLoaded = engine.getValue(sampleDeck, "track_loaded"),
        playing = engine.getValue(sampleDeck, "play");

    if (trackLoaded && playing) {
        script.toggleControl(sampleDeck, "stop");
    } else if (trackLoaded && !playing && value) {
        script.toggleControl(sampleDeck, "eject");
    }
};

PioneerDDJRR.samplerVelocityVolume = function(channel, control, value, status, group) {
    var index = control - 0x30 + 1,
        deck = PioneerDDJRR.channelGroups[group],
        deckOffset = PioneerDDJRR.selectedSamplerBank * 8,
        sampleDeck = "[Sampler" + (index + deckOffset) + "]",
        vol = value / 0x7F;

    if (PioneerDDJRR.samplerVelocityMode[deck]) {
        engine.setParameter(sampleDeck, "volume", vol);
    }
};

PioneerDDJRR.changeParameters = function(group, ctrl, value) {
    var deck = PioneerDDJRR.channelGroups[group],
        index,
        offset = 0,
        samplerIndex = 0,
        beatjumpSize = 0;

    //Hot Cue Mode:
    if (ctrl === PioneerDDJRR.nonPadLeds.parameterLeftHotCueMode) {
        engine.setValue(group, "beatjump_backward", value);
    }
    if (ctrl === PioneerDDJRR.nonPadLeds.parameterRightHotCueMode) {
        engine.setValue(group, "beatjump_forward", value);
    }
    if (ctrl === PioneerDDJRR.nonPadLeds.shiftParameterLeftHotCueMode) {
        PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.shiftParameterLeftHotCueMode, value);
        if (value) {
            beatjumpSize = engine.getValue(group, "beatjump_size");
            engine.setValue(group, "beatjump_size", beatjumpSize / 2);
        }
    }
    if (ctrl === PioneerDDJRR.nonPadLeds.shiftParameterRightHotCueMode) {
        PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.shiftParameterRightHotCueMode, value);
        if (value) {
            beatjumpSize = engine.getValue(group, "beatjump_size");
            engine.setValue(group, "beatjump_size", beatjumpSize * 2);
        }
    }

    // ignore other cases if button is released:
    if (!value) {
        return;
    }

    //Roll Mode:
    if (ctrl === PioneerDDJRR.nonPadLeds.parameterLeftRollMode || ctrl === PioneerDDJRR.nonPadLeds.parameterRightRollMode) {
        // unbind previous connected controls:
        for (index in PioneerDDJRR.selectedLooprollIntervals[deck]) {
            if (PioneerDDJRR.selectedLooprollIntervals[deck].hasOwnProperty(index)) {
                engine.connectControl(
                    group,
                    "beatlooproll_" + PioneerDDJRR.selectedLooprollIntervals[deck][index] + "_activate",
                    "PioneerDDJRR.beatlooprollLeds",
                    true
                );
            }
        }
        // change parameter set:
        if (ctrl === PioneerDDJRR.nonPadLeds.parameterLeftRollMode && PioneerDDJRR.selectedLoopRollParam[deck] > 0) {
            PioneerDDJRR.selectedLoopRollParam[deck] -= 1;
        } else if (ctrl === PioneerDDJRR.nonPadLeds.parameterRightRollMode && PioneerDDJRR.selectedLoopRollParam[deck] < 3) {
            PioneerDDJRR.selectedLoopRollParam[deck] += 1;
        }
        PioneerDDJRR.selectedLooprollIntervals[deck] = PioneerDDJRR.loopIntervals[PioneerDDJRR.selectedLoopRollParam[deck]];
        // bind new controls:
        for (index in PioneerDDJRR.selectedLooprollIntervals[deck]) {
            if (PioneerDDJRR.selectedLooprollIntervals[deck].hasOwnProperty(index)) {
                engine.connectControl(
                    group,
                    "beatlooproll_" + PioneerDDJRR.selectedLooprollIntervals[deck][index] + "_activate",
                    "PioneerDDJRR.beatlooprollLeds",
                    false
                );
            }
        }
    }

    //Group2 (Beatloop) Mode:
    if (ctrl === PioneerDDJRR.nonPadLeds.parameterLeftGroup2Mode || ctrl === PioneerDDJRR.nonPadLeds.parameterRightGroup2Mode) {
        // unbind previous connected controls:
        for (index in PioneerDDJRR.selectedLoopIntervals[deck]) {
            if (PioneerDDJRR.selectedLoopIntervals[deck].hasOwnProperty(index)) {
                engine.connectControl(
                    group,
                    "beatloop_" + PioneerDDJRR.selectedLoopIntervals[deck][index] + "_enabled",
                    "PioneerDDJRR.beatloopLeds",
                    true
                );
            }
        }
        // change parameter set:
        if (ctrl === PioneerDDJRR.nonPadLeds.parameterLeftGroup2Mode && PioneerDDJRR.selectedLoopParam[deck] > 0) {
            PioneerDDJRR.selectedLoopParam[deck] -= 1;
        } else if (ctrl === PioneerDDJRR.nonPadLeds.parameterRightGroup2Mode && PioneerDDJRR.selectedLoopParam[deck] < 3) {
            PioneerDDJRR.selectedLoopParam[deck] += 1;
        }
        PioneerDDJRR.selectedLoopIntervals[deck] = PioneerDDJRR.loopIntervals[PioneerDDJRR.selectedLoopParam[deck]];
        // bind new controls:
        for (index in PioneerDDJRR.selectedLoopIntervals[deck]) {
            if (PioneerDDJRR.selectedLoopIntervals[deck].hasOwnProperty(index)) {
                engine.connectControl(
                    group,
                    "beatloop_" + PioneerDDJRR.selectedLoopIntervals[deck][index] + "_enabled",
                    "PioneerDDJRR.beatloopLeds",
                    false
                );
            }
        }
    }

    //Sampler Mode:
    if (ctrl === PioneerDDJRR.nonPadLeds.parameterLeftSamplerMode || ctrl === PioneerDDJRR.nonPadLeds.parameterRightSamplerMode) {
        // unbind previous connected controls:
        for (index in PioneerDDJRR.samplerGroups) {
            if (PioneerDDJRR.samplerGroups.hasOwnProperty(index)) {
                offset = PioneerDDJRR.selectedSamplerBank * 8;
                samplerIndex = (PioneerDDJRR.samplerGroups[index] + 1) + offset;
                engine.connectControl(
                    "[Sampler" + samplerIndex + "]",
                    "duration",
                    "PioneerDDJRR.samplerLeds",
                    true
                );
                engine.connectControl(
                    "[Sampler" + samplerIndex + "]",
                    "play",
                    "PioneerDDJRR.samplerLedsPlay",
                    true
                );
            }
        }
        // change sampler bank:
        if (ctrl === PioneerDDJRR.nonPadLeds.parameterLeftSamplerMode && PioneerDDJRR.selectedSamplerBank > 0) {
            PioneerDDJRR.selectedSamplerBank -= 1;
        } else if (ctrl === PioneerDDJRR.nonPadLeds.parameterRightSamplerMode && PioneerDDJRR.selectedSamplerBank < 3) {
            PioneerDDJRR.selectedSamplerBank += 1;
        }
        // bind new controls:
        for (index in PioneerDDJRR.samplerGroups) {
            if (PioneerDDJRR.samplerGroups.hasOwnProperty(index)) {
                offset = PioneerDDJRR.selectedSamplerBank * 8;
                samplerIndex = (PioneerDDJRR.samplerGroups[index] + 1) + offset;
                engine.connectControl(
                    "[Sampler" + samplerIndex + "]",
                    "duration",
                    "PioneerDDJRR.samplerLeds",
                    false
                );
                engine.connectControl(
                    "[Sampler" + samplerIndex + "]",
                    "play",
                    "PioneerDDJRR.samplerLedsPlay",
                    false
                );
                engine.trigger("[Sampler" + samplerIndex + "]", "duration");
            }
        }
    }

    //Slicer Mode:
    if (ctrl === PioneerDDJRR.nonPadLeds.parameterLeftSlicerMode || ctrl === PioneerDDJRR.nonPadLeds.parameterRightSlicerMode) {
        // change parameter set:
        if (ctrl === PioneerDDJRR.nonPadLeds.parameterLeftSlicerMode && PioneerDDJRR.selectedSlicerQuantizeParam[deck] > 0) {
            PioneerDDJRR.selectedSlicerQuantizeParam[deck] -= 1;
        } else if (ctrl === PioneerDDJRR.nonPadLeds.parameterRightSlicerMode && PioneerDDJRR.selectedSlicerQuantizeParam[deck] < 3) {
            PioneerDDJRR.selectedSlicerQuantizeParam[deck] += 1;
        }
        PioneerDDJRR.selectedSlicerQuantization[deck] = PioneerDDJRR.slicerQuantizations[PioneerDDJRR.selectedSlicerQuantizeParam[deck]];
    }
    //Slicer Mode + SHIFT:
    if (ctrl === PioneerDDJRR.nonPadLeds.shiftParameterLeftSlicerMode || ctrl === PioneerDDJRR.nonPadLeds.shiftParameterRightSlicerMode) {
        // change parameter set:
        if (ctrl === PioneerDDJRR.nonPadLeds.shiftParameterLeftSlicerMode && PioneerDDJRR.selectedSlicerDomainParam[deck] > 0) {
            PioneerDDJRR.selectedSlicerDomainParam[deck] -= 1;
        } else if (ctrl === PioneerDDJRR.nonPadLeds.shiftParameterRightSlicerMode && PioneerDDJRR.selectedSlicerDomainParam[deck] < 3) {
            PioneerDDJRR.selectedSlicerDomainParam[deck] += 1;
        }
        PioneerDDJRR.selectedSlicerDomain[deck] = PioneerDDJRR.slicerDomains[PioneerDDJRR.selectedSlicerDomainParam[deck]];
    }

    // update parameter status leds:
    PioneerDDJRR.updateParameterStatusLeds(
        group,
        PioneerDDJRR.selectedLoopRollParam[deck],
        PioneerDDJRR.selectedLoopParam[deck],
        PioneerDDJRR.selectedSamplerBank,
        PioneerDDJRR.selectedSlicerQuantizeParam[deck],
        PioneerDDJRR.selectedSlicerDomainParam[deck]
    );
};

PioneerDDJRR.parameterLeft = function(channel, control, value, status, group) {
    PioneerDDJRR.changeParameters(group, control, value);
};

PioneerDDJRR.parameterRight = function(channel, control, value, status, group) {
    PioneerDDJRR.changeParameters(group, control, value);
};

PioneerDDJRR.shiftParameterLeft = function(channel, control, value, status, group) {
    PioneerDDJRR.changeParameters(group, control, value);
};

PioneerDDJRR.shiftParameterRight = function(channel, control, value, status, group) {
    PioneerDDJRR.changeParameters(group, control, value);
};

// DDJ-RR: No dedicated VINYL button exists. Scratch mode is always ON by default.
// The vinylButton function is kept for compatibility but not triggered by any hardware button.
PioneerDDJRR.vinylButton = function(channel, control, value, status, group) {
    PioneerDDJRR.toggleScratch(channel, control, value, status, group);
};

// DDJ-RR: SLIP button sends note 0x17 (mapped from vinylButton in DDJ-SX).
// This function is now triggered by the DDJ-RR SLIP button (note 0x17).
PioneerDDJRR.slipButton = function(channel, control, value, status, group) {
    if (!value) {
        return;
    }
    if (PioneerDDJRR.shiftPressed) {
        // SHIFT + SLIP: toggle vinyl control for this deck (same as Ctrl+T in Mixxx)
        script.toggleControl(group, "vinylcontrol_enabled");
    } else {
        script.toggleControl(group, "slip_enabled");
    }
};

// DDJ-RR: SLIP REVERSE button sends note 0x40 (was SLIP in DDJ-SX mapping).
// Maps to reverseRoll (slip-reverse playback) in Mixxx.
PioneerDDJRR.slipReverseButton = function(channel, control, value, status, group) {
    engine.setValue(group, "reverseroll", value ? 1 : 0);
};

PioneerDDJRR.keyLockButton = function(channel, control, value, status, group) {
    if (value) {
        script.toggleControl(group, "keylock");
    }
};

// Tempo-Range stages cycled by Shift + Master Tempo (TEMPO RANGE).
// Each press advances to the next value and wraps around (90 % -> 4 %).
PioneerDDJRR.tempoRanges = [0.04, 0.10, 0.25, 0.50, 0.90];

PioneerDDJRR.shiftKeyLockButton = function(channel, control, value, status, group) {
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.shiftKeyLock, value);

    // Only act on button press, not release.
    if (!value) {
        return;
    }

    var ranges = PioneerDDJRR.tempoRanges,
        current = engine.getValue(group, "rateRange"),
        idx = -1;

    // Find the current stage (FP-tolerant — ControlPotmeter storage can leave
    // the value at a tiny floating-point offset from the literal stage value).
    for (var i = 0; i < ranges.length; i++) {
        if (Math.abs(ranges[i] - current) < 0.005) {
            idx = i;
            break;
        }
    }

    // Advance to the next stage, wrapping around. Unknown value -> first stage.
    engine.setValue(group, "rateRange", ranges[(idx + 1) % ranges.length]);
};

PioneerDDJRR.tempoResetButton = function(channel, control, value, status, group) {
    var deck = PioneerDDJRR.channelGroups[group];
    if (value) {
        engine.setValue(group, "rate", 0);
        if (PioneerDDJRR.syncRate[deck] !== engine.getValue(group, "rate")) {
            PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.takeoverPlus, 0);
            PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.takeoverMinus, 0);
            PioneerDDJRR.syncRate[deck] = 0;
        }
    }
};

PioneerDDJRR.autoLoopButton = function(channel, control, value, status, group) {
    if (value) {
        if (engine.getValue(group, "loop_enabled")) {
            // Exit a running loop by REMOVING it entirely, so the grey loop
            // region disappears from the waveform instead of lingering as a
            // deactivated loop. loop_remove keeps loops saved to a hotcue.
            engine.setValue(group, "loop_remove", 1);
        } else {
            engine.setValue(group, "beatloop_activate", true);
            engine.setValue(group, "beatloop_activate", false);
        }
    }
};

PioneerDDJRR.loopActiveButton = function(channel, control, value, status, group) {
    engine.setValue(group, "reloop_toggle", value);
};

PioneerDDJRR.loopInButton = function(channel, control, value, status, group) {
    var deck = PioneerDDJRR.channelGroups[group];
    if (value) {
        PioneerDDJRR.loopInHeld[deck] = true;
        PioneerDDJRR.loopInDidJog[deck] = false;
        PioneerDDJRR.loopInSetOnPress[deck] = false;
        PioneerDDJRR.cancelScratchForLoopAdjust(deck);
        if (!engine.getValue(group, "loop_enabled")) {
            // No loop active yet: mark the loop-in point immediately on press,
            // so it lands at the play position the moment the button is hit
            // instead of lagging to the release (which often snapped to the
            // next beat). When a loop IS already enabled we keep the deferred
            // behaviour below so hold+jog can still nudge the existing start.
            engine.setValue(group, "loop_in", 1);
            engine.setValue(group, "loop_in", 0);
            PioneerDDJRR.loopInSetOnPress[deck] = true;
        }
    } else {
        PioneerDDJRR.loopInHeld[deck] = false;
        if (!PioneerDDJRR.loopInDidJog[deck] && !PioneerDDJRR.loopInSetOnPress[deck]) {
            // Tap on an already-enabled loop (no jog): redefine loop-in here.
            engine.setValue(group, "loop_in", 1);
            engine.setValue(group, "loop_in", 0);
        }
        PioneerDDJRR.loopInDidJog[deck] = false;
        PioneerDDJRR.loopInSetOnPress[deck] = false;
    }
};

PioneerDDJRR.shiftLoopInButton = function(channel, control, value, status, group) {
    script.toggleControl(group, "reloop_andstop");
};

PioneerDDJRR.loopOutButton = function(channel, control, value, status, group) {
    var deck = PioneerDDJRR.channelGroups[group];
    if (value) {
        PioneerDDJRR.loopOutHeld[deck] = true;
        PioneerDDJRR.loopOutDidJog[deck] = false;
        PioneerDDJRR.loopOutSetOnPress[deck] = false;
        PioneerDDJRR.cancelScratchForLoopAdjust(deck);
        if (!engine.getValue(group, "loop_enabled")) {
            // No loop active yet: mark the loop-out point immediately on press
            // (this is the gesture that creates the loop), so the end lands at
            // the play position the moment the button is hit instead of lagging
            // to the release. When a loop IS already enabled we keep the
            // deferred behaviour below so hold+jog can still nudge the end.
            engine.setValue(group, "loop_out", 1);
            engine.setValue(group, "loop_out", 0);
            PioneerDDJRR.loopOutSetOnPress[deck] = true;
        }
    } else {
        PioneerDDJRR.loopOutHeld[deck] = false;
        if (!PioneerDDJRR.loopOutDidJog[deck] && !PioneerDDJRR.loopOutSetOnPress[deck]) {
            // Tap on an already-enabled loop (no jog): redefine loop-out here.
            engine.setValue(group, "loop_out", 1);
            engine.setValue(group, "loop_out", 0);
        }
        PioneerDDJRR.loopOutDidJog[deck] = false;
        PioneerDDJRR.loopOutSetOnPress[deck] = false;
    }
};

PioneerDDJRR.loopExitButton = function(channel, control, value, status, group) {
    // SHIFT + LOOP OUT: fully remove the loop (clears the grey region from the
    // waveform) instead of only deactivating it. loop_remove preserves loops
    // that are stored in a hotcue.
    if (value) {
        engine.setValue(group, "loop_remove", 1);
    }
};

PioneerDDJRR.loopHalveButton = function(channel, control, value, status, group) {
    script.toggleControl(group, "loop_halve");
};

PioneerDDJRR.loopDoubleButton = function(channel, control, value, status, group) {
    script.toggleControl(group, "loop_double");
};

PioneerDDJRR.loopMoveBackButton = function(channel, control, value, status, group) {
    script.toggleControl(group, "beatjump_1_backward");
};

PioneerDDJRR.loopMoveForwardButton = function(channel, control, value, status, group) {
    script.toggleControl(group, "beatjump_1_forward");
};

PioneerDDJRR.loadButton = function(channel, control, value, status, group) {
    if (value) {
        engine.setValue(group, "LoadSelectedTrack", true);
        if (PioneerDDJRR.autoPFL) {
            for (var index in PioneerDDJRR.channelGroups) {
                if (PioneerDDJRR.channelGroups.hasOwnProperty(index)) {
                    if (index === group) {
                        engine.setValue(index, "pfl", true);
                    } else {
                        engine.setValue(index, "pfl", false);
                    }
                }
            }
        }
    }
};

PioneerDDJRR.crossfaderAssignCenter = function(channel, control, value, status, group) {
    if (value) {
        engine.setValue(group, "orientation", 1);
    }
};

PioneerDDJRR.crossfaderAssignLeft = function(channel, control, value, status, group) {
    if (value) {
        engine.setValue(group, "orientation", 0);
    }
};

PioneerDDJRR.crossfaderAssignRight = function(channel, control, value, status, group) {
    if (value) {
        engine.setValue(group, "orientation", 2);
    }
};

PioneerDDJRR.reverseRollButton = function(channel, control, value, status, group) {
    script.toggleControl(group, "reverseroll");
};

PioneerDDJRR.reverseButton = function(channel, control, value, status, group) {
    script.toggleControl(group, "reverse");
};

PioneerDDJRR.gridAdjustButton = function(channel, control, value, status, group) {
    var deck = PioneerDDJRR.channelGroups[group];

    PioneerDDJRR.gridAdjustSelected[deck] = value ? true : false;
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.gridAdjust, value);
};

PioneerDDJRR.gridSetButton = function(channel, control, value, status, group) {
    script.toggleControl(group, "beats_translate_curpos");
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.shiftGridAdjust, value);
};

PioneerDDJRR.gridSlideButton = function(channel, control, value, status, group) {
    var deck = PioneerDDJRR.channelGroups[group];

    PioneerDDJRR.gridSlideSelected[deck] = value ? true : false;
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.gridSlide, value);
};

PioneerDDJRR.syncButton = function(channel, control, value, status, group) {
    if (value) {
        script.toggleControl(group, "sync_enabled");
    }
};

PioneerDDJRR.quantizeButton = function(channel, control, value, status, group) {
    if (value) {
        script.toggleControl(group, "quantize");
    }
};

PioneerDDJRR.needleSearchTouch = function(channel, control, value, status, group) {
    var deck = PioneerDDJRR.channelGroups[group];
    if (engine.getValue(group, "play")) {
        PioneerDDJRR.needleSearchTouched[deck] = PioneerDDJRR.shiftPressed && (value ? true : false);
    } else {
        PioneerDDJRR.needleSearchTouched[deck] = value ? true : false;
    }
};

PioneerDDJRR.needleSearchStripPosition = function(channel, control, value, status, group) {
    var deck = PioneerDDJRR.channelGroups[group];
    if (PioneerDDJRR.needleSearchTouched[deck]) {
        var position = value / 0x7F;
        engine.setValue(group, "playposition", position);
    }
};

PioneerDDJRR.panelSelectButton = function(channel, control, value, status, group) {
    if (value) {
        if ((PioneerDDJRR.panels[0] === false) && (PioneerDDJRR.panels[1] === false)) {
            PioneerDDJRR.panels[0] = true;
        } else if ((PioneerDDJRR.panels[0] === true) && (PioneerDDJRR.panels[1] === false)) {
            PioneerDDJRR.panels[1] = true;
        } else if ((PioneerDDJRR.panels[0] === true) && (PioneerDDJRR.panels[1] === true)) {
            PioneerDDJRR.panels[0] = false;
        } else if ((PioneerDDJRR.panels[0] === false) && (PioneerDDJRR.panels[1] === true)) {
            PioneerDDJRR.panels[1] = false;
        }

        engine.setValue("[Samplers]", "show_samplers", PioneerDDJRR.panels[0]);
        engine.setValue("[EffectRack1]", "show", PioneerDDJRR.panels[1]);
    }
};

PioneerDDJRR.shiftPanelSelectButton = function(channel, control, value, status, group) {
    var channelGroup;
    PioneerDDJRR.shiftPanelSelectPressed = value ? true : false;

    for (var index in PioneerDDJRR.fxUnitGroups) {
        if (PioneerDDJRR.fxUnitGroups.hasOwnProperty(index)) {
            if (PioneerDDJRR.fxUnitGroups[index] < 2) {
                for (channelGroup in PioneerDDJRR.channelGroups) {
                    if (PioneerDDJRR.channelGroups.hasOwnProperty(channelGroup)) {
                        engine.connectControl(index, "group_" + channelGroup + "_enable", "PioneerDDJRR.fxAssignLeds", value);
                        if (value) {
                            engine.trigger(index, "group_" + channelGroup + "_enable");
                        }
                    }
                }
            }
            if (PioneerDDJRR.fxUnitGroups[index] >= 2) {
                for (channelGroup in PioneerDDJRR.channelGroups) {
                    if (PioneerDDJRR.channelGroups.hasOwnProperty(channelGroup)) {
                        engine.connectControl(index, "group_" + channelGroup + "_enable", "PioneerDDJRR.fxAssignLeds", !value);
                        if (value) {
                            engine.trigger(index, "group_" + channelGroup + "_enable");
                        } else {
                            PioneerDDJRR.fxAssignLedControl(index, PioneerDDJRR.channelGroups[channelGroup], false);
                        }
                    }
                }
            }
        }
    }
};


///////////////////////////////////////////////////////////////
//                          LED HELPERS                      //
///////////////////////////////////////////////////////////////

PioneerDDJRR.deckConverter = function(group) {
    if (PioneerDDJRR.channelGroups.hasOwnProperty(group)) {
        return PioneerDDJRR.channelGroups[group];
    }
    return group;
};

PioneerDDJRR.flashLedState = 0;

PioneerDDJRR.flashLed = function(deck, ledNumber) {
    if (PioneerDDJRR.flashLedState === 0) {
        PioneerDDJRR.nonPadLedControl(deck, ledNumber, 1);
        PioneerDDJRR.flashLedState = 1;
    } else if (PioneerDDJRR.flashLedState === 1) {
        PioneerDDJRR.nonPadLedControl(deck, ledNumber, 0);
        PioneerDDJRR.flashLedState = 0;
    }
};

PioneerDDJRR.resetNonDeckLeds = function() {
    var indexFxUnit;

    // fx Leds:
    for (indexFxUnit in PioneerDDJRR.fxUnitGroups) {
        if (PioneerDDJRR.fxUnitGroups.hasOwnProperty(indexFxUnit)) {
            if (PioneerDDJRR.fxUnitGroups[indexFxUnit] < 2) {
                for (var indexFxLed in PioneerDDJRR.fxEffectGroups) {
                    if (PioneerDDJRR.fxEffectGroups.hasOwnProperty(indexFxLed)) {
                        PioneerDDJRR.fxLedControl(
                            PioneerDDJRR.fxUnitGroups[indexFxUnit],
                            PioneerDDJRR.fxEffectGroups[indexFxLed],
                            false,
                            false
                        );
                        PioneerDDJRR.fxLedControl(
                            PioneerDDJRR.fxUnitGroups[indexFxUnit],
                            PioneerDDJRR.fxEffectGroups[indexFxLed],
                            true,
                            false
                        );
                    }
                }
                PioneerDDJRR.fxLedControl(PioneerDDJRR.fxUnitGroups[indexFxUnit], 0x03, false, false);
                PioneerDDJRR.fxLedControl(PioneerDDJRR.fxUnitGroups[indexFxUnit], 0x03, true, false);
            }
        }
    }

    // fx assign Leds:
    for (indexFxUnit in PioneerDDJRR.fxUnitGroups) {
        if (PioneerDDJRR.fxUnitGroups.hasOwnProperty(indexFxUnit)) {
            for (var channelGroup in PioneerDDJRR.channelGroups) {
                if (PioneerDDJRR.channelGroups.hasOwnProperty(channelGroup)) {
                    PioneerDDJRR.fxAssignLedControl(
                        indexFxUnit,
                        PioneerDDJRR.channelGroups[channelGroup],
                        false
                    );
                }
            }
        }
    }

    // general Leds:
    PioneerDDJRR.generalLedControl(PioneerDDJRR.nonPadLeds.shiftMasterCue, false);
    PioneerDDJRR.generalLedControl(PioneerDDJRR.nonPadLeds.loadDeck1, false);
    PioneerDDJRR.generalLedControl(PioneerDDJRR.nonPadLeds.shiftLoadDeck1, false);
    PioneerDDJRR.generalLedControl(PioneerDDJRR.nonPadLeds.loadDeck2, false);
    PioneerDDJRR.generalLedControl(PioneerDDJRR.nonPadLeds.shiftLoadDeck2, false);
    PioneerDDJRR.generalLedControl(PioneerDDJRR.nonPadLeds.loadDeck3, false);
    PioneerDDJRR.generalLedControl(PioneerDDJRR.nonPadLeds.shiftLoadDeck3, false);
    PioneerDDJRR.generalLedControl(PioneerDDJRR.nonPadLeds.loadDeck4, false);
    PioneerDDJRR.generalLedControl(PioneerDDJRR.nonPadLeds.shiftLoadDeck4, false);
};

PioneerDDJRR.fxAssignLedControl = function(unit, ledNumber, active) {
    var fxAssignLedsBaseChannel = 0x96,
        fxAssignLedsBaseControl = 0;

    if (unit === "[EffectRack1_EffectUnit1]") {
        fxAssignLedsBaseControl = PioneerDDJRR.nonPadLeds.fx1assignDeck1;
    }
    if (unit === "[EffectRack1_EffectUnit2]") {
        fxAssignLedsBaseControl = PioneerDDJRR.nonPadLeds.fx2assignDeck1;
    }
    if (unit === "[EffectRack1_EffectUnit3]") {
        fxAssignLedsBaseControl = PioneerDDJRR.nonPadLeds.shiftFx1assignDeck1;
    }
    if (unit === "[EffectRack1_EffectUnit4]") {
        fxAssignLedsBaseControl = PioneerDDJRR.nonPadLeds.shiftFx2assignDeck1;
    }

    midi.sendShortMsg(
        fxAssignLedsBaseChannel,
        fxAssignLedsBaseControl + ledNumber,
        active ? 0x7F : 0x00
    );
};

PioneerDDJRR.fxLedControl = function(unit, ledNumber, shift, active) {
    var fxLedsBaseChannel = 0x94,
        fxLedsBaseControl = (shift ? 0x63 : 0x47);

    midi.sendShortMsg(
        fxLedsBaseChannel + unit,
        fxLedsBaseControl + ledNumber,
        active ? 0x7F : 0x00
    );
};

PioneerDDJRR.padLedControl = function(deck, groupNumber, ledNumber, shift, active) {
    var padLedsBaseChannel = 0x97,
        padLedControl = (shift ? 0x08 : 0x00) + groupNumber + ledNumber,
        midiChannelOffset = PioneerDDJRR.deckConverter(deck);

    if (midiChannelOffset !== null) {
        midi.sendShortMsg(
            padLedsBaseChannel + midiChannelOffset,
            padLedControl,
            active ? 0x7F : 0x00
        );
    }
};

PioneerDDJRR.nonPadLedControl = function(deck, ledNumber, active) {
    var nonPadLedsBaseChannel = 0x90,
        midiChannelOffset = PioneerDDJRR.deckConverter(deck);

    if (midiChannelOffset !== null) {
        midi.sendShortMsg(
            nonPadLedsBaseChannel + midiChannelOffset,
            ledNumber,
            active ? 0x7F : 0x00
        );
    }
};

PioneerDDJRR.illuminateFunctionControl = function(ledNumber, active) {
    var illuminationBaseChannel = 0x9B;

    midi.sendShortMsg(
        illuminationBaseChannel,
        ledNumber,
        active ? 0x7F : 0x00
    );
};

PioneerDDJRR.wheelLedControl = function(deck, ledNumber) {
    var wheelLedBaseChannel = 0xBB,
        channel = PioneerDDJRR.deckConverter(deck);

    if (channel !== null) {
        midi.sendShortMsg(
            wheelLedBaseChannel,
            channel,
            ledNumber
        );
    }
};

PioneerDDJRR.generalLedControl = function(ledNumber, active) {
    var generalLedBaseChannel = 0x96;

    midi.sendShortMsg(
        generalLedBaseChannel,
        ledNumber,
        active ? 0x7F : 0x00
    );
};

PioneerDDJRR.updateParameterStatusLeds = function(group, statusRoll, statusLoop, statusSampler, statusSlicerQuant, statusSlicerDomain) {
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.parameterLeftRollMode, statusRoll & (1 << 1));
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.parameterRightRollMode, statusRoll & 1);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.parameterLeftGroup2Mode, statusLoop & (1 << 1));
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.parameterRightGroup2Mode, statusLoop & 1);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.parameterLeftSamplerMode, statusSampler & (1 << 1));
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.parameterRightSamplerMode, statusSampler & 1);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.parameterLeftSlicerMode, statusSlicerQuant & (1 << 1));
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.parameterRightSlicerMode, statusSlicerQuant & 1);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.shiftParameterLeftSlicerMode, statusSlicerDomain & (1 << 1));
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.shiftParameterRightSlicerMode, statusSlicerDomain & 1);
};


///////////////////////////////////////////////////////////////
//                             LEDS                          //
///////////////////////////////////////////////////////////////

PioneerDDJRR.fxAssignLeds = function(value, group, control) {
    var channelGroup = control.replace("group_", '').replace("_enable", '');
    PioneerDDJRR.fxAssignLedControl(group, PioneerDDJRR.channelGroups[channelGroup], value);
};

PioneerDDJRR.headphoneCueLed = function(value, group, control) {
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.headphoneCue, value);
};

PioneerDDJRR.shiftHeadphoneCueLed = function(value, group, control) {
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.shiftHeadphoneCue, value);
};

PioneerDDJRR.shiftMasterCueLed = function(value, group, control) {
    PioneerDDJRR.generalLedControl(PioneerDDJRR.nonPadLeds.shiftMasterCue, value);
};

PioneerDDJRR.keyLockLed = function(value, group, control) {
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.keyLock, value);
};

PioneerDDJRR.playLed = function(value, group, control) {
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.play, value);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.shiftPlay, value);
};

PioneerDDJRR.wheelLeds = function(value, group, control) {
    // Timing calculation is handled in seconds!
    var deck = PioneerDDJRR.channelGroups[group],
        duration = engine.getValue(group, "duration"),
        elapsedTime = value * duration,
        remainingTime = duration - elapsedTime,
        revolutionsPerSecond = PioneerDDJRR.scratchSettings.vinylSpeed / 60,
        speed = parseInt(revolutionsPerSecond * PioneerDDJRR.wheelLedCircle.maxVal),
        wheelPos = PioneerDDJRR.wheelLedCircle.minVal;

    if (value >= 0) {
        wheelPos = PioneerDDJRR.wheelLedCircle.minVal + 0x01 + ((speed * elapsedTime) % PioneerDDJRR.wheelLedCircle.maxVal);
    } else {
        wheelPos = PioneerDDJRR.wheelLedCircle.maxVal + 0x01 + ((speed * elapsedTime) % PioneerDDJRR.wheelLedCircle.maxVal);
    }
    // let wheel LEDs blink if remaining time is less than 30s:
    if (remainingTime > 0 && remainingTime < 30 && !engine.isScratching(deck + 1)) {
        var blinkInterval = parseInt(remainingTime / 3); //increase blinking according time left
        if (blinkInterval < 3) {
            blinkInterval = 3;
        }
        if (PioneerDDJRR.wheelLedsBlinkStatus[deck] < blinkInterval) {
            wheelPos = PioneerDDJRR.wheelLedCircle.minVal;
        } else if (PioneerDDJRR.wheelLedsBlinkStatus[deck] > (blinkInterval - parseInt(6 / blinkInterval))) {
            PioneerDDJRR.wheelLedsBlinkStatus[deck] = 0;
        }
        PioneerDDJRR.wheelLedsBlinkStatus[deck]++;
    }
    wheelPos = parseInt(wheelPos);
    // Only send midi message when the position is actually updated.
    // Otherwise, the amount of messages may exceed the maximum rate at high position update rates.
    if (PioneerDDJRR.wheelLedsPosition[deck] !== wheelPos) {
      PioneerDDJRR.wheelLedControl(group, wheelPos);
    }
    PioneerDDJRR.wheelLedsPosition[deck] = wheelPos;
};

PioneerDDJRR.cueLed = function(value, group, control) {
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.cue, value);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.shiftCue, value);
};

PioneerDDJRR.loadLed = function(value, group, control) {
    var deck = PioneerDDJRR.channelGroups[group];
    if (value > 0) {
        PioneerDDJRR.wheelLedControl(group, PioneerDDJRR.wheelLedCircle.maxVal);
        PioneerDDJRR.generalLedControl(PioneerDDJRR.nonPadLeds["loadDeck" + (deck + 1)], true);
        PioneerDDJRR.illuminateFunctionControl(PioneerDDJRR.illuminationControl["loadedDeck" + (deck + 1)], true);
        engine.trigger(group, "playposition");
    } else {
        PioneerDDJRR.wheelLedControl(group, PioneerDDJRR.wheelLedCircle.minVal);
    }
};

PioneerDDJRR.reverseLed = function(value, group, control) {
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.censor, value);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.shiftCensor, value);
};

PioneerDDJRR.slipLed = function(value, group, control) {
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.slip, value);
};

PioneerDDJRR.quantizeLed = function(value, group, control) {
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.shiftSync, value);
};

PioneerDDJRR.syncLed = function(value, group, control) {
    var deck = PioneerDDJRR.channelGroups[group];
    var rate = engine.getValue(group, "rate");
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.sync, value);
    if (value) {
        PioneerDDJRR.syncRate[deck] = rate;
        if (PioneerDDJRR.syncRate[deck] > 0) {
            PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.takeoverMinus, 1);
            PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.takeoverPlus, 0);
        } else if (PioneerDDJRR.syncRate[deck] < 0) {
            PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.takeoverMinus, 0);
            PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.takeoverPlus, 1);
        }
    }
    if (!value) {
        if (PioneerDDJRR.syncRate[deck] !== rate || rate === 0) {
            PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.takeoverPlus, 0);
            PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.takeoverMinus, 0);
            PioneerDDJRR.syncRate[deck] = 0;
        }
    }
};

PioneerDDJRR.autoLoopLed = function(value, group, control) {
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.autoLoop, value);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.shiftLoopOut, value);
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.shiftAutoLoop, value);
};

PioneerDDJRR.loopInLed = function(value, group, control) {
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.loopIn, value);
};

PioneerDDJRR.shiftLoopInLed = function(value, group, control) {
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.shiftLoopIn, value);
};

PioneerDDJRR.loopOutLed = function(value, group, control) {
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.loopOut, value);
};

PioneerDDJRR.loopHalveLed = function(value, group, control) {
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.loopHalve, value);
};

PioneerDDJRR.loopDoubleLed = function(value, group, control) {
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.loopDouble, value);
};

PioneerDDJRR.loopShiftFWLed = function(value, group, control) {
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.shiftLoopDouble, value);
};

PioneerDDJRR.loopShiftBKWLed = function(value, group, control) {
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.shiftLoopHalve, value);
};

PioneerDDJRR.hotCueParameterRightLed = function(value, group, control) {
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.parameterRightHotCueMode, value);
};

PioneerDDJRR.hotCueParameterLeftLed = function(value, group, control) {
    PioneerDDJRR.nonPadLedControl(group, PioneerDDJRR.nonPadLeds.parameterLeftHotCueMode, value);
};

PioneerDDJRR.samplerLeds = function(value, group, control) {
    var samplerIndex = (group.replace("[Sampler", '').replace(']', '') - 1) % 8,
        sampleDeck = "[Sampler" + (samplerIndex + 1) + "]",
        padNum = PioneerDDJRR.samplerGroups[sampleDeck];

    for (var index in PioneerDDJRR.channelGroups) {
        if (PioneerDDJRR.channelGroups.hasOwnProperty(index)) {
            PioneerDDJRR.padLedControl(
                PioneerDDJRR.channelGroups[index],
                PioneerDDJRR.ledGroups.sampler,
                padNum,
                false,
                value
            );
        }
    }
};

PioneerDDJRR.samplerLedsPlay = function(value, group, control) {
    var samplerIndex = (group.replace("[Sampler", '').replace(']', '') - 1) % 8,
        sampleDeck = "[Sampler" + (samplerIndex + 1) + "]",
        padNum = PioneerDDJRR.samplerGroups[sampleDeck];

    if (!engine.getValue(sampleDeck, "duration")) {
        return;
    }

    for (var index in PioneerDDJRR.channelGroups) {
        if (PioneerDDJRR.channelGroups.hasOwnProperty(index)) {
            PioneerDDJRR.padLedControl(
                PioneerDDJRR.channelGroups[index],
                PioneerDDJRR.ledGroups.sampler,
                padNum,
                false, !value
            );
            PioneerDDJRR.padLedControl(
                PioneerDDJRR.channelGroups[index],
                PioneerDDJRR.ledGroups.sampler,
                padNum,
                true,
                value
            );
        }
    }
};

PioneerDDJRR.beatloopLeds = function(value, group, control) {
    var padNum,
        shifted = false,
        deck = PioneerDDJRR.channelGroups[group];

    for (var index in PioneerDDJRR.selectedLoopIntervals[deck]) {
        if (PioneerDDJRR.selectedLoopIntervals[deck].hasOwnProperty(index)) {
            if (control === "beatloop_" + PioneerDDJRR.selectedLoopIntervals[deck][index] + "_enabled") {
                padNum = index % 8;
                PioneerDDJRR.padLedControl(group, PioneerDDJRR.ledGroups.group2, padNum, shifted, value);
            }
        }
    }
};

PioneerDDJRR.beatlooprollLeds = function(value, group, control) {
    var padNum,
        shifted = false,
        deck = PioneerDDJRR.channelGroups[group];

    for (var index in PioneerDDJRR.selectedLooprollIntervals[deck]) {
        if (PioneerDDJRR.selectedLooprollIntervals[deck].hasOwnProperty(index)) {
            if (control === "beatlooproll_" + PioneerDDJRR.selectedLooprollIntervals[deck][index] + "_activate") {
                padNum = index % 8;
                PioneerDDJRR.padLedControl(group, PioneerDDJRR.ledGroups.loopRoll, padNum, shifted, value);
            }
        }
    }
};

PioneerDDJRR.hotCueLeds = function(value, group, control) {
    var padNum = null,
        hotCueNum;

    for (hotCueNum = 1; hotCueNum <= 8; hotCueNum++) {
        if (control === "hotcue_" + hotCueNum + "_enabled") {
            padNum = (hotCueNum - 1);
            PioneerDDJRR.padLedControl(group, PioneerDDJRR.ledGroups.hotCue, padNum, false, value);
            PioneerDDJRR.padLedControl(group, PioneerDDJRR.ledGroups.hotCue, padNum, true, value);
        }
    }
};

PioneerDDJRR.VuMeterLeds = function(value, group, control) {
    // Remark: Only deck vu meters can be controlled! Master vu meter is handled by hardware!
    var midiBaseAdress = 0xB0,
        channel = 0x02,
        midiOut = 0x00;

    value = parseInt(value * 0x76); //full level indicator: 0x7F

    if (engine.getValue(group, "peak_indicator")) {
        value = value + 0x09;
    }

    PioneerDDJRR.valueVuMeter[group + "_current"] = value;

    for (var index in PioneerDDJRR.channelGroups) {
        if (PioneerDDJRR.channelGroups.hasOwnProperty(index)) {
            midiOut = PioneerDDJRR.valueVuMeter[index + "_current"];
            if (PioneerDDJRR.twinkleVumeterAutodjOn) {
                if (engine.getValue("[AutoDJ]", "enabled")) {
                    if (PioneerDDJRR.valueVuMeter[index + "_enabled"]) {
                        midiOut = 0;
                    }
                    if (midiOut < 5 && !PioneerDDJRR.valueVuMeter[index + "_enabled"]) {
                        midiOut = 5;
                    }
                }
            }
            midi.sendShortMsg(
                midiBaseAdress + PioneerDDJRR.channelGroups[index],
                channel,
                midiOut
            );
        }
    }
};


///////////////////////////////////////////////////////////////
//                          JOGWHEELS                        //
///////////////////////////////////////////////////////////////

PioneerDDJRR.getJogWheelDelta = function(value) {
    // The Wheel control centers on 0x40; find out how much it's moved by.
    return value - 0x40;
};

PioneerDDJRR.jogRingTick = function(channel, control, value, status, group) {
    var deck = PioneerDDJRR.channelGroups[group];
    // Loop-endpoint adjust: while LOOP IN / LOOP OUT is held, ring ticks nudge
    // the loop boundary instead of pitch-bending the deck.
    if (PioneerDDJRR.isLoopAdjustHeld(deck)) {
        PioneerDDJRR.adjustLoopEndpoint(group, deck, PioneerDDJRR.getJogWheelDelta(value));
        return;
    }
    // After touch release the DDJ-RR sends inertia ticks on CC 0x21 (ring),
    // not CC 0x22 (platter). Routing rules:
    //   - During active scratch, pending stop, or post-release inertia →
    //     scratchTick. Once scratchDisable has fired, scratchTick is a no-op
    //     so leftover spin-down ticks are absorbed instead of leaking into
    //     pitchBendFromJog (which would produce an unwanted slow pitch-bend
    //     identical to manual outer-edge spinning).
    //   - Otherwise → pitchBendFromJog (manual outer-edge tempo nudging).
    if (PioneerDDJRR.scratchMode[deck] &&
            (engine.isScratching(deck + 1) ||
                PioneerDDJRR.stopScratchTimer[deck] !== null ||
                PioneerDDJRR.postReleaseInertia[deck])) {
        // Tick-driven reset: while the wheel is still feeding inertia ticks
        // and scratch is still active, re-arm the stop timer so scratching
        // continues until the platter physically stops.
        if (PioneerDDJRR.postReleaseInertia[deck] &&
                PioneerDDJRR.stopScratchTimer[deck] !== null) {
            PioneerDDJRR.scheduleStopScratch(deck);
        }
        engine.scratchTick(deck + 1, PioneerDDJRR.getJogWheelDelta(value));
    } else {
        PioneerDDJRR.pitchBendFromJog(group, PioneerDDJRR.getJogWheelDelta(value));
    }
};

PioneerDDJRR.jogRingTickShift = function(channel, control, value, status, group) {
    PioneerDDJRR.pitchBendFromJog(
        group,
        PioneerDDJRR.getJogWheelDelta(value) * PioneerDDJRR.jogwheelShiftMultiplier
    );
};

// Schedules scratchDisable after a short debounce. The debounce absorbs brief
// capacitive sensor dropouts without causing premature scratchDisable.
// No tick-based reset: inertia ticks after release become no-ops (scratchTick
// is a no-op in Mixxx when scratch is not enabled), so the position freezes
// cleanly when the user releases the jog.
// Schedules / re-arms the scratchDisable timer. Idempotent: every call cancels
// the previous timer and restarts the 80ms countdown, so tick handlers can
// invoke this on each inertia tick to keep scratch alive while the platter is
// still spinning down. scratchDisable fires only when ticks stop arriving.
PioneerDDJRR.scheduleStopScratch = function(deck) {
    if (PioneerDDJRR.stopScratchTimer[deck] !== null) {
        engine.stopTimer(PioneerDDJRR.stopScratchTimer[deck]);
        PioneerDDJRR.stopScratchTimer[deck] = null;
    }
    var deckNum = deck + 1;
    var deckIdx = deck;
    PioneerDDJRR.stopScratchTimer[deck] = engine.beginTimer(
        80,
        function() {
            engine.scratchDisable(deckNum, false);
            PioneerDDJRR.stopScratchTimer[deckIdx] = null;
        },
        true
    );
};

// Control number of the platter "no vinyl mode" jog ticks (CC 0x23 on all
// decks). In this controller jog mode the platter sends movement ticks WITHOUT
// a preceding touch event, so scratch is never enabled via jogTouch.
PioneerDDJRR.JOG_PLATTER_NO_VINYL = 0x23;

PioneerDDJRR.jogPlatterTick = function(channel, control, value, status, group) {
    var deck = PioneerDDJRR.channelGroups[group];

    if (PioneerDDJRR.isLoopAdjustHeld(deck)) {
        PioneerDDJRR.adjustLoopEndpoint(group, deck, PioneerDDJRR.getJogWheelDelta(value));
        return;
    }

    if (PioneerDDJRR.gridAdjustSelected[deck]) {
        if (PioneerDDJRR.getJogWheelDelta(value) > 0) {
            script.toggleControl(group, "beats_adjust_faster");
        }
        if (PioneerDDJRR.getJogWheelDelta(value) <= 0) {
            script.toggleControl(group, "beats_adjust_slower");
        }
        return;
    }
    if (PioneerDDJRR.gridSlideSelected[deck]) {
        if (PioneerDDJRR.getJogWheelDelta(value) > 0) {
            script.toggleControl(group, "beats_translate_later");
        }
        if (PioneerDDJRR.getJogWheelDelta(value) <= 0) {
            script.toggleControl(group, "beats_translate_earlier");
        }
        return;
    }

    if (PioneerDDJRR.scratchMode[deck]) {
        var noVinyl = (control === PioneerDDJRR.JOG_PLATTER_NO_VINYL);
        // "No vinyl" jog mode sends platter ticks without a touch event, so
        // scratch was never enabled and scratchTick would be a no-op (the jog
        // appears dead). Enable scratch on the fly here so the platter always
        // seeks, regardless of the controller's vinyl-mode state.
        if (noVinyl && !engine.isScratching(deck + 1)) {
            engine.scratchEnable(
                deck + 1,
                PioneerDDJRR.scratchSettings.jogResolution,
                PioneerDDJRR.scratchSettings.vinylSpeed,
                PioneerDDJRR.scratchSettings.alpha,
                PioneerDDJRR.scratchSettings.beta,
                true
            );
        }
        // Tick-driven reset for platter inertia (mirrors jogRingTick).
        if (PioneerDDJRR.postReleaseInertia[deck] &&
                PioneerDDJRR.stopScratchTimer[deck] !== null) {
            PioneerDDJRR.scheduleStopScratch(deck);
        }
        // No isScratching() check: after scratchDisable, scratchTick is a no-op in
        // Mixxx, so physical inertia ticks after release cause no unwanted pitchBend.
        engine.scratchTick(deck + 1, PioneerDDJRR.getJogWheelDelta(value));
        // No-vinyl mode normally has no touch-release to end the scratch, so
        // (re)arm the stop timer on every tick; it disables scratch ~80ms after
        // the platter stops sending ticks. But while the touch sensor IS held,
        // let the release path end the scratch instead — otherwise the 80ms
        // auto-stop would cut off a deliberately held platter and, with slip
        // enabled, snap to the virtual position (audible stutter). The vinyl
        // path keeps its touch-driven release.
        if (noVinyl && !PioneerDDJRR.jogTouchHeld[deck]) {
            PioneerDDJRR.scheduleStopScratch(deck);
        }
    } else {
        PioneerDDJRR.pitchBendFromJog(group, PioneerDDJRR.getJogWheelDelta(value));
    }
};

PioneerDDJRR.jogPlatterTickShift = function(channel, control, value, status, group) {
    var deck = PioneerDDJRR.channelGroups[group];

    if (PioneerDDJRR.scratchMode[deck]) {
        engine.scratchTick(deck + 1, PioneerDDJRR.getJogWheelDelta(value));
    } else {
        PioneerDDJRR.pitchBendFromJog(
            group,
            PioneerDDJRR.getJogWheelDelta(value) * PioneerDDJRR.jogwheelShiftMultiplier
        );
    }
};

PioneerDDJRR.jogTouch = function(channel, control, value, status, group) {
    var deck = PioneerDDJRR.channelGroups[group];

    // Track the physical touch state regardless of jog mode or loop-adjust, so
    // the no-vinyl tick path (jogPlatterTick) can tell a held platter from a
    // free spin. Cleared on release below via the same value.
    PioneerDDJRR.jogTouchHeld[deck] = (value !== 0);

    // While LOOP IN / LOOP OUT is held, ignore the platter touch sensor so
    // scratch is never engaged: playback continues unaffected and only
    // loop_start/end_position is moved by the jog ticks.
    if (PioneerDDJRR.isLoopAdjustHeld(deck)) {
        return;
    }

    if (PioneerDDJRR.scratchMode[deck]) {
        if (value) {
            // Touch down: cancel any pending stop timer and enable scratch immediately.
            if (PioneerDDJRR.stopScratchTimer[deck] !== null) {
                engine.stopTimer(PioneerDDJRR.stopScratchTimer[deck]);
                PioneerDDJRR.stopScratchTimer[deck] = null;
            }
            // Touch is back: cancel any post-release inertia handling.
            if (PioneerDDJRR.postReleaseInertiaTimer[deck] !== null) {
                engine.stopTimer(PioneerDDJRR.postReleaseInertiaTimer[deck]);
                PioneerDDJRR.postReleaseInertiaTimer[deck] = null;
            }
            PioneerDDJRR.postReleaseInertia[deck] = false;
            engine.scratchEnable(
                deck + 1,
                PioneerDDJRR.scratchSettings.jogResolution,
                PioneerDDJRR.scratchSettings.vinylSpeed,
                PioneerDDJRR.scratchSettings.alpha,
                PioneerDDJRR.scratchSettings.beta,
                true
            );
        } else {
            // Touch released: arm the scratchDisable timer (80ms). While the
            // platter is still spinning, ring ticks re-arm this timer (see
            // jogRingTick) so the wheel inertia keeps scratching the track
            // until rotation actually stops.
            PioneerDDJRR.scheduleStopScratch(deck);

            // Mark deck as in post-release inertia. This makes ring ticks
            // route through scratchTick (no-op once scratchDisable has fired)
            // instead of pitchBendFromJog, and lets tick handlers extend the
            // stop timer. Safety auto-clear at 1500ms guards against a stuck
            // flag if no ticks arrive.
            PioneerDDJRR.postReleaseInertia[deck] = true;
            if (PioneerDDJRR.postReleaseInertiaTimer[deck] !== null) {
                engine.stopTimer(PioneerDDJRR.postReleaseInertiaTimer[deck]);
                PioneerDDJRR.postReleaseInertiaTimer[deck] = null;
            }
            var inertiaDeckIdx = deck;
            PioneerDDJRR.postReleaseInertiaTimer[deck] = engine.beginTimer(
                1500,
                function() {
                    PioneerDDJRR.postReleaseInertia[inertiaDeckIdx] = false;
                    PioneerDDJRR.postReleaseInertiaTimer[inertiaDeckIdx] = null;
                },
                true
            );
        }
    }
};

PioneerDDJRR.toggleScratch = function(channel, control, value, status, group) {
    var deck = PioneerDDJRR.channelGroups[group];
    if (value) {
        PioneerDDJRR.scratchMode[deck] = !PioneerDDJRR.scratchMode[deck];
        PioneerDDJRR.triggerVinylLed(deck);
    }
};

PioneerDDJRR.triggerVinylLed = function(deck) {
    PioneerDDJRR.nonPadLedControl(deck, PioneerDDJRR.nonPadLeds.vinyl, PioneerDDJRR.scratchMode[deck]);
};

PioneerDDJRR.pitchBendFromJog = function(group, movement) {
    engine.setValue(group, "jog", movement / 5 * PioneerDDJRR.jogwheelSensitivity);
};

// Returns true if either LOOP IN or LOOP OUT is currently held on this deck.
// While held, jog ticks adjust the loop endpoint instead of scratching/bending.
PioneerDDJRR.isLoopAdjustHeld = function(deck) {
    return PioneerDDJRR.loopInHeld[deck] || PioneerDDJRR.loopOutHeld[deck];
};

// Cancels any active scratch state when entering loop-adjust mode, so that
// playback continues normally while the user nudges loop_start/end_position.
// Called from loopInButton / loopOutButton on press.
PioneerDDJRR.cancelScratchForLoopAdjust = function(deck) {
    if (PioneerDDJRR.stopScratchTimer[deck] !== null) {
        engine.stopTimer(PioneerDDJRR.stopScratchTimer[deck]);
        PioneerDDJRR.stopScratchTimer[deck] = null;
    }
    if (PioneerDDJRR.postReleaseInertiaTimer[deck] !== null) {
        engine.stopTimer(PioneerDDJRR.postReleaseInertiaTimer[deck]);
        PioneerDDJRR.postReleaseInertiaTimer[deck] = null;
    }
    PioneerDDJRR.postReleaseInertia[deck] = false;
    if (engine.isScratching(deck + 1)) {
        engine.scratchDisable(deck + 1, false);
    }
};

// Nudges loop_start_position or loop_end_position by the given jog delta.
// Only acts while a loop is enabled. Clamps so start stays below end and end
// stays above start (with a small minimum gap). Marks the matching DidJog
// flag so the button release handler skips the tap-trigger.
PioneerDDJRR.adjustLoopEndpoint = function(group, deck, delta) {
    if (delta === 0) {
        return;
    }
    if (!engine.getValue(group, "loop_enabled")) {
        return;
    }
    var minGap = 200; // samples — keep loop length non-zero
    var loopStart = engine.getValue(group, "loop_start_position");
    var loopEnd = engine.getValue(group, "loop_end_position");
    var step = delta * PioneerDDJRR.loopAdjustSamplesPerTick;

    if (PioneerDDJRR.loopInHeld[deck]) {
        var newStart = loopStart + step;
        if (newStart < 0) { newStart = 0; }
        if (newStart > loopEnd - minGap) { newStart = loopEnd - minGap; }
        engine.setValue(group, "loop_start_position", newStart);
        PioneerDDJRR.loopInDidJog[deck] = true;
    } else if (PioneerDDJRR.loopOutHeld[deck]) {
        var newEnd = loopEnd + step;
        if (newEnd < loopStart + minGap) { newEnd = loopStart + minGap; }
        engine.setValue(group, "loop_end_position", newEnd);
        PioneerDDJRR.loopOutDidJog[deck] = true;
    }
};


///////////////////////////////////////////////////////////////
//             ROTARY SELECTOR & NAVIGATION BUTTONS          //
///////////////////////////////////////////////////////////////

PioneerDDJRR.loadPrepareButton = function(channel, control, value, status) {
    if (PioneerDDJRR.rotarySelectorChanged === true) {
        if (value) {
            engine.setValue("[PreviewDeck1]", "LoadSelectedTrackAndPlay", true);
        } else {
            if (PioneerDDJRR.jumpPreviewEnabled) {
                engine.setValue("[PreviewDeck1]", "playposition", PioneerDDJRR.jumpPreviewPosition);
            }
            PioneerDDJRR.rotarySelectorChanged = false;
        }
    } else {
        if (value) {
            if (engine.getValue("[PreviewDeck1]", "stop")) {
                script.toggleControl("[PreviewDeck1]", "play");
            } else {
                script.toggleControl("[PreviewDeck1]", "stop");
            }
        }
    }
};

PioneerDDJRR.backButton = function(channel, control, value, status) {
    script.toggleControl("[Library]", "MoveFocusBackward");
};

PioneerDDJRR.shiftBackButton = function(channel, control, value, status) {
    if (value) {
        script.toggleControl("[Skin]", "show_maximized_library");
    }
};

PioneerDDJRR.getRotaryDelta = function(value) {
    var delta = 0x40 - Math.abs(0x40 - value),
        isCounterClockwise = value > 0x40;

    if (isCounterClockwise) {
        delta *= -1;
    }
    return delta;
};

PioneerDDJRR.rotarySelector = function(channel, control, value, status) {
    var delta = PioneerDDJRR.getRotaryDelta(value);

    engine.setValue("[Library]", "MoveVertical", delta);
    PioneerDDJRR.rotarySelectorChanged = true;
};

PioneerDDJRR.rotarySelectorShifted = function(channel, control, value, status) {
    var delta = PioneerDDJRR.getRotaryDelta(value),
        f = (delta > 0 ? "SelectNextPlaylist" : "SelectPrevPlaylist");

    engine.setValue("[Library]", "MoveHorizontal", delta);
};

PioneerDDJRR.rotarySelectorClick = function(channel, control, value, status) {
    script.toggleControl("[Library]", "GoToItem");
};

PioneerDDJRR.rotarySelectorShiftedClick = function(channel, control, value, status) {
    if (PioneerDDJRR.autoDJAddTop) {
        script.toggleControl("[Library]", "AutoDjAddTop");
    } else {
        script.toggleControl("[Library]", "AutoDjAddBottom");
    }
};


///////////////////////////////////////////////////////////////
//                             FX                            //
///////////////////////////////////////////////////////////////

PioneerDDJRR.fxAssignButton = function(channel, control, value, status, group) {
    if (value) {
        if ((control >= 0x4C) && (control <= 0x4F)) {
            script.toggleControl("[EffectRack1_EffectUnit1]", "group_" + group + "_enable");
        } else if ((control >= 0x50) && (control <= 0x53)) {
            script.toggleControl("[EffectRack1_EffectUnit2]", "group_" + group + "_enable");
        } else if ((control >= 0x70) && (control <= 0x73) && PioneerDDJRR.shiftPanelSelectPressed) {
            script.toggleControl("[EffectRack1_EffectUnit3]", "group_" + group + "_enable");
        } else if ((control >= 0x54) && (control <= 0x57) && PioneerDDJRR.shiftPanelSelectPressed) {
            script.toggleControl("[EffectRack1_EffectUnit4]", "group_" + group + "_enable");
        }
    }
};

// SHIFT + FXn-m ON: cycle to the next effect in slot m of EffectUnit n.
// The XML bindings target [EffectRack1_EffectUnitN_EffectM] so group already
// names the right slot — we just bump effect_selector on press.
PioneerDDJRR.fxSelectNextEffect = function(channel, control, value, status, group) {
    if (value) {
        engine.setValue(group, "effect_selector", 1);
    }
};


///////////////////////////////////////////////////////////////
//                       BEAT JUMP MODE                      //
///////////////////////////////////////////////////////////////
// SHIFT + HOTCUE on the controller switches the pads into BEATJUMP-Mode
// (handled in hardware — pads then send their own note range starting at
// 0x40). PAD1/PAD2 trigger backward/forward jumps by beatjump_size; the
// PARAMETER1 buttons in this mode (notes 0x28 / 0x30) halve/double the size.

PioneerDDJRR.beatJumpButton = function(channel, control, value, status, group) {
    if (!value) {
        return;
    }
    if (control === 0x40) {
        engine.setValue(group, "beatjump_backward", 1);
    } else if (control === 0x41) {
        engine.setValue(group, "beatjump_forward", 1);
    }
};

PioneerDDJRR.beatJumpSizeAdjust = function(channel, control, value, status, group) {
    if (!value) {
        return;
    }
    var size = engine.getValue(group, "beatjump_size");
    if (control === 0x28) {
        engine.setValue(group, "beatjump_size", size / 2);
    } else if (control === 0x30) {
        engine.setValue(group, "beatjump_size", size * 2);
    }
};


///////////////////////////////////////////////////////////////
//                          SLICER                           //
///////////////////////////////////////////////////////////////

PioneerDDJRR.slicerBeatActive = function(value, group, control) {
    // This slicer implementation will work for constant beatgrids only!
    var deck = PioneerDDJRR.channelGroups[group],
        bpm = engine.getValue(group, "bpm"),
        playposition = engine.getValue(group, "playposition"),
        duration = engine.getValue(group, "duration"),
        slicerPosInSection = 0,
        ledBeatState = true,
        domain = PioneerDDJRR.selectedSlicerDomain[deck];

    if (engine.getValue(group, "beat_closest") === engine.getValue(group, "beat_next")) {
        return;
    }

    PioneerDDJRR.slicerBeatsPassed[deck] = Math.round((playposition * duration) * (bpm / 60));
    slicerPosInSection = Math.floor((PioneerDDJRR.slicerBeatsPassed[deck] % domain) / (domain / 8));

    if (PioneerDDJRR.activePadMode[deck] === PioneerDDJRR.padModes.slicer) {
        if (PioneerDDJRR.activeSlicerMode[deck] === PioneerDDJRR.slicerModes.contSlice) {
            ledBeatState = true;
        }
        if (PioneerDDJRR.activeSlicerMode[deck] === PioneerDDJRR.slicerModes.loopSlice) {
            ledBeatState = false;
            if (((PioneerDDJRR.slicerBeatsPassed[deck] - 1) % domain) === (domain - 1) &&
                !PioneerDDJRR.slicerAlreadyJumped[deck] &&
                PioneerDDJRR.slicerPreviousBeatsPassed[deck] < PioneerDDJRR.slicerBeatsPassed[deck]) {
                engine.setValue(group, "beatjump", -domain);
                PioneerDDJRR.slicerAlreadyJumped[deck] = true;
            } else {
                PioneerDDJRR.slicerAlreadyJumped[deck] = false;
            }
        }
        // PAD Led control:
        for (var i = 0; i < 8; i++) {
            if (PioneerDDJRR.slicerActive[deck]) {
                if (PioneerDDJRR.slicerButton[deck] !== i) {
                    PioneerDDJRR.padLedControl(
                        group,
                        PioneerDDJRR.ledGroups.slicer,
                        i,
                        false,
                        (slicerPosInSection === i) ? ledBeatState : !ledBeatState
                    );
                }
            } else {
                PioneerDDJRR.padLedControl(
                    group,
                    PioneerDDJRR.ledGroups.slicer,
                    i,
                    false,
                    (slicerPosInSection === i) ? ledBeatState : !ledBeatState
                );
            }
        }
    } else {
        PioneerDDJRR.slicerAlreadyJumped[deck] = false;
        PioneerDDJRR.slicerPreviousBeatsPassed[deck] = 0;
        PioneerDDJRR.slicerActive[deck] = false;
    }
};
