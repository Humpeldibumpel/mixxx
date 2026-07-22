#pragma once

#include <vector>

#include "rendergraph/geometrynode.h"
#include "util/class.h"
#include "waveform/renderers/allshader/waveformrenderersignalbase.h"

namespace allshader {
class WaveformRendererRGB;
} // namespace allshader

class allshader::WaveformRendererRGB final
        : public allshader::WaveformRendererSignalBase,
          public rendergraph::GeometryNode {
  public:
    explicit WaveformRendererRGB(WaveformWidgetRenderer* waveformWidget,
            ::WaveformRendererAbstract::PositionSource type =
                    ::WaveformRendererAbstract::Play,
            WaveformRendererSignalBase::Options options = WaveformRendererSignalBase::Option::None);

    // Pure virtual from WaveformRendererSignalBase, not used
    void onSetup(const QDomNode& node) override;

    bool supportsSlip() const override {
        return true;
    }

    // Virtuals for rendergraph::Node
    void preprocess() override;

  public slots:
    void setAxesColor(const QColor& axesColor);
    void setLowColor(const QColor& lowColor);
    void setMidColor(const QColor& midColor);
    void setHighColor(const QColor& highColor);

  private:
    bool m_isSlipRenderer;
    WaveformRendererSignalBase::Options m_options;

    bool preprocessInner();

    // Reused per-frame scratch buffers for the two-pass smoothing, kept as
    // members to avoid heap (re)allocation on every preprocess() call.
    std::vector<float> m_ampTop;
    std::vector<float> m_ampBottom;
    std::vector<float> m_color0R;
    std::vector<float> m_color0G;
    std::vector<float> m_color0B;
    std::vector<float> m_color1R;
    std::vector<float> m_color1G;
    std::vector<float> m_color1B;

    DISALLOW_COPY_AND_ASSIGN(WaveformRendererRGB);
};
