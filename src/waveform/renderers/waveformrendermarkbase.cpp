#include "waveform/renderers/waveformrendermarkbase.h"

#include "moc_waveformrendermarkbase.cpp"
#include "track/track.h"
#include "waveform/renderers/waveformwidgetrenderer.h"

WaveformRenderMarkBase::WaveformRenderMarkBase(
        WaveformWidgetRenderer* pWaveformWidgetRenderer,
        bool updateImagesImmediately)
        : WaveformRendererAbstract(pWaveformWidgetRenderer),
          m_updateImagesImmediately(updateImagesImmediately) {
}

void WaveformRenderMarkBase::setup(const QDomNode& node, const SkinContext& context) {
    WaveformSignalColors signalColors = *m_waveformRenderer->getWaveformSignalColors();
    m_marks.setup(m_waveformRenderer->getGroup(), node, context, signalColors);
    // Connections must happen after m_marks.setup(), because init() runs
    // before setup() in the widget construction and m_marks is empty there.
    // Loop start/end positions are CO-driven (not Cue-driven), so we cannot
    // rely on Track::cuesUpdated alone (see upstream commits 1adf980e/831aff08
    // for hotcue updates via Cue::updated(), and e5d207c8 which restored the
    // overview connection — this is the equivalent fix for the live waveform).
    m_marks.connectSamplePositionChanged(this, &WaveformRenderMarkBase::onMarkChanged);
    m_marks.connectSampleEndPositionChanged(this, &WaveformRenderMarkBase::onMarkChanged);
    m_marks.connectVisibleChanged(this, &WaveformRenderMarkBase::onMarkChanged);
}

bool WaveformRenderMarkBase::init() {
    return true;
}

void WaveformRenderMarkBase::onSetTrack() {
    updateMarksFromCues();

    const TrackPointer pTrackInfo = m_waveformRenderer->getTrackInfo();
    if (!pTrackInfo) {
        return;
    }

    connect(pTrackInfo.get(),
            &Track::cuesUpdated,
            this,
            &WaveformRenderMarkBase::slotCuesUpdated);
}

void WaveformRenderMarkBase::onResize() {
    m_marks.setBreadth(m_waveformRenderer->getBreadth());
    if (m_updateImagesImmediately) {
        updateMarkImages();
    }
}

void WaveformRenderMarkBase::onMarkChanged(double v) {
    Q_UNUSED(v);

    updateMarks();
}

void WaveformRenderMarkBase::slotCuesUpdated() {
    updateMarksFromCues();
}

void WaveformRenderMarkBase::updateMarksFromCues() {
    const TrackPointer pTrackInfo = m_waveformRenderer->getTrackInfo();
    if (!pTrackInfo) {
        return;
    }

    const int dimBrightThreshold = m_waveformRenderer->getDimBrightThreshold();
    const QList<CuePointer> loadedCues = pTrackInfo->getCuePoints();
    for (const CuePointer& pCue : loadedCues) {
        const int hotCue = pCue->getHotCue();
        if (hotCue == Cue::kNoHotCue) {
            continue;
        }

        // Here we assume no two cues can have the same hotcue assigned,
        // because WaveformMarkSet stores one mark for each hotcue.
        WaveformMarkPointer pMark = m_marks.getHotCueMark(hotCue);
        if (pMark.isNull()) {
            continue;
        }

        QString newLabel = pCue->getLabel();
        QColor newColor = mixxx::RgbColor::toQColor(pCue->getColor());
        pMark->setText(newLabel);
        pMark->setBaseColor(newColor, dimBrightThreshold);
    }

    updateMarks();
}

void WaveformRenderMarkBase::updateMarks() {
    m_marks.update();
    if (m_updateImagesImmediately) {
        updateMarkImages();
    }
}

void WaveformRenderMarkBase::updateMarkImages() {
    for (const auto& pMark : m_marks) {
        if (pMark->needsImageUpdate()) {
            updateMarkImage(pMark);
        }
    }
}
