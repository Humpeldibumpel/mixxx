#include "waveform/renderers/allshader/waveformrendererfiltered.h"

#include <vector>

#include "rendergraph/material/rgbmaterial.h"
#include "rendergraph/vertexupdaters/rgbvertexupdater.h"
#include "track/track.h"
#include "util/math.h"
#include "waveform/renderers/waveformwidgetrenderer.h"
#include "waveform/waveform.h"

using namespace rendergraph;

namespace allshader {

WaveformRendererFiltered::WaveformRendererFiltered(
        WaveformWidgetRenderer* waveformWidget,
        bool bRgbStacked)
        : WaveformRendererSignalBase(waveformWidget),
          m_bRgbStacked(bRgbStacked) {
    initForRectangles<RGBMaterial>(0);
    setUsePreprocess(true);
}

void WaveformRendererFiltered::onSetup(const QDomNode&) {
}

void WaveformRendererFiltered::preprocess() {
    if (!preprocessInner()) {
        if (geometry().vertexCount() != 0) {
            geometry().allocate(0);
            markDirtyGeometry();
        }
    }
}

bool WaveformRendererFiltered::preprocessInner() {
    TrackPointer pTrack = m_waveformRenderer->getTrackInfo();

    if (!pTrack) {
        return false;
    }

    ConstWaveformPointer waveform = pTrack->getWaveform();
    if (waveform.isNull()) {
        return false;
    }

    const int dataSize = waveform->getDataSize();
    if (dataSize <= 1) {
        return false;
    }

    const WaveformData* data = waveform->data();
    if (data == nullptr) {
        return false;
    }
#ifdef __STEM__
    auto stemInfo = pTrack->getStemInfo();
    // If this track is a stem track, skip the rendering
    if (!stemInfo.isEmpty() && waveform->hasStem()) {
        return false;
    }
#endif

    const float devicePixelRatio = m_waveformRenderer->getDevicePixelRatio();
    const int length = static_cast<int>(m_waveformRenderer->getLength());
    const int pixelLength = static_cast<int>(m_waveformRenderer->getLength() * devicePixelRatio);
    const float invDevicePixelRatio = 1.f / devicePixelRatio;
    const float halfPixelSize = 0.5f / devicePixelRatio;

    // See waveformrenderersimple.cpp for a detailed explanation of the frame and index calculation
    const int visualFramesSize = dataSize / 2;
    const double firstVisualFrame =
            m_waveformRenderer->getFirstDisplayedPosition() * visualFramesSize;
    const double lastVisualFrame =
            m_waveformRenderer->getLastDisplayedPosition() * visualFramesSize;

    // Represents the # of visual frames per horizontal pixel.
    const double visualIncrementPerPixel =
            (lastVisualFrame - firstVisualFrame) / static_cast<double>(pixelLength);

    // Per-band gain from the EQ knobs.
    float allGain(1.0);
    float bandGain[3] = {1.0, 1.0, 1.0};
    getGains(&allGain, true, &bandGain[0], &bandGain[1], &bandGain[2]);

    const float breadth = static_cast<float>(m_waveformRenderer->getBreadth());
    const float halfBreadth = breadth / 2.0f;

    const float heightFactor = allGain * halfBreadth / m_maxValue;

    // Effective visual frame for x
    double xVisualFrame = qRound(firstVisualFrame / visualIncrementPerPixel) *
            visualIncrementPerPixel;

    const int numVerticesPerLine = 6; // 2 triangles

    // low, mid, high + horizontal axis
    int reserved = numVerticesPerLine * (pixelLength * 3 + 1);

    geometry().setDrawingMode(Geometry::DrawingMode::Triangles);
    geometry().allocate(reserved);
    markDirtyGeometry();

    QVector3D rgb[3];
    if (m_bRgbStacked) {
        rgb[0] = QVector3D(static_cast<float>(m_rgbLowColor_r),
                static_cast<float>(m_rgbLowColor_g),
                static_cast<float>(m_rgbLowColor_b));
        rgb[1] = QVector3D(static_cast<float>(m_rgbMidColor_r),
                static_cast<float>(m_rgbMidColor_g),
                static_cast<float>(m_rgbMidColor_b));
        rgb[2] = QVector3D(static_cast<float>(m_rgbHighColor_r),
                static_cast<float>(m_rgbHighColor_g),
                static_cast<float>(m_rgbHighColor_b));
    } else {
        rgb[0] = QVector3D(static_cast<float>(m_lowColor_r),
                static_cast<float>(m_lowColor_g),
                static_cast<float>(m_lowColor_b));
        rgb[1] = QVector3D(static_cast<float>(m_midColor_r),
                static_cast<float>(m_midColor_g),
                static_cast<float>(m_midColor_b));
        rgb[2] = QVector3D(static_cast<float>(m_highColor_r),
                static_cast<float>(m_highColor_g),
                static_cast<float>(m_highColor_b));
    }

    RGBVertexUpdater axisVertexUpdater{geometry().vertexDataAs<Geometry::RGBColoredPoint2D>()};
    axisVertexUpdater.addRectangle({0.f,
                                           halfBreadth - 0.5f},
            {static_cast<float>(length),
                    halfBreadth + 0.5f},
            {static_cast<float>(m_axesColor_r),
                    static_cast<float>(m_axesColor_g),
                    static_cast<float>(m_axesColor_b)});

    RGBVertexUpdater vertexUpdater[3]{
            {geometry().vertexDataAs<Geometry::RGBColoredPoint2D>() +
                    numVerticesPerLine},
            {geometry().vertexDataAs<Geometry::RGBColoredPoint2D>() +
                    numVerticesPerLine * (1 + pixelLength)},
            {geometry().vertexDataAs<Geometry::RGBColoredPoint2D>() +
                    numVerticesPerLine * (1 + pixelLength * 2)}};
    const double maxSamplingRange = visualIncrementPerPixel / 2.0;

    // Two-pass rendering to allow smoothing of the per-band amplitude
    // envelopes: pass 1 gathers the per-pixel band maxima, then an
    // onset-preserving smoothing is applied over each band, and pass 2 emits
    // the stacked geometry. The colors are left untouched (only the heights are
    // smoothed).

    // [band][channel] amplitude per pixel. Reused member buffers: resize() is a
    // no-op once pixelLength is stable, so there is no per-frame heap traffic.
    // No zero-fill needed because pass 1 writes every pixel below.
    for (int b = 0; b < 3; ++b) {
        m_bandMax[b][0].resize(pixelLength);
        m_bandMax[b][1].resize(pixelLength);
    }

    // Pass 1: gather per-pixel band maxima.
    for (int pos = 0; pos < pixelLength; ++pos) {
        const int visualFrameStart = std::lround(xVisualFrame - maxSamplingRange);
        const int visualFrameStop = std::lround(xVisualFrame + maxSamplingRange);

        const int visualIndexStart = std::max(visualFrameStart * 2, 0);
        const int visualIndexStop =
                std::min(std::max(visualFrameStop, visualFrameStart + 1) * 2, dataSize - 1);

        // 3 bands, 2 channels
        uchar u8max[3][2]{};
        for (int chn = 0; chn < 2; chn++) {
            for (int i = visualIndexStart + chn; i < visualIndexStop + chn; i += 2) {
                const WaveformData& waveformData = data[i];

                u8max[0][chn] = math_max(u8max[0][chn], waveformData.filtered.low);
                u8max[1][chn] = math_max(u8max[1][chn], waveformData.filtered.mid);
                u8max[2][chn] = math_max(u8max[2][chn], waveformData.filtered.high);
            }
            // Cast to float
            m_bandMax[0][chn][pos] = static_cast<float>(u8max[0][chn]);
            m_bandMax[1][chn][pos] = static_cast<float>(u8max[1][chn]);
            m_bandMax[2][chn][pos] = static_cast<float>(u8max[2][chn]);
        }

        xVisualFrame += visualIncrementPerPixel;
    }

    // Onset-preserving smoothing of each band's amplitude envelope: instant
    // attack (rising values are followed immediately) keeps the sharp leading
    // edge that marks the start of a sound, while a gradual release eases the
    // decay and removes the jagged dips. Processed left-to-right (= past to
    // future). kReleaseFactor in [0,1): higher = smoother/longer decay,
    // 0 = no smoothing.
    constexpr float kReleaseFactor = 0.78f;
    if (kReleaseFactor > 0.f) {
        for (int b = 0; b < 3; ++b) {
            for (int chn = 0; chn < 2; ++chn) {
                std::vector<float>& v = m_bandMax[b][chn];
                float env = 0.f;
                for (int pos = 0; pos < pixelLength; ++pos) {
                    const float raw = v[pos];
                    env = (raw >= env)
                            ? raw
                            : env * kReleaseFactor + raw * (1.f - kReleaseFactor);
                    v[pos] = env;
                }
            }
        }
    }

    // Pass 2: emit the geometry (3 stacked bands).
    // TODO: this can be optimized by using one geometrynode per band
    // + one for the horizontal axis, and uniform color materials,
    // instead of passing constant color as vertex.
    for (int pos = 0; pos < pixelLength; ++pos) {
        const float fpos = static_cast<float>(pos) * invDevicePixelRatio;

        for (int bandIndex = 0; bandIndex < 3; bandIndex++) {
            const float top = m_bandMax[bandIndex][0][pos] * bandGain[bandIndex];
            const float bottom = m_bandMax[bandIndex][1][pos] * bandGain[bandIndex];

            vertexUpdater[bandIndex].addRectangle(
                    {fpos - halfPixelSize,
                            halfBreadth - heightFactor * top},
                    {fpos + halfPixelSize,
                            halfBreadth + heightFactor * bottom},
                    {rgb[bandIndex]});
        }
    }

    DEBUG_ASSERT(reserved ==
            vertexUpdater[0].index() + vertexUpdater[1].index() +
                    vertexUpdater[2].index() +
                    numVerticesPerLine); // all lines on the three channels and
                                         // the axis

    markDirtyMaterial();

    return true;
}

} // namespace allshader
