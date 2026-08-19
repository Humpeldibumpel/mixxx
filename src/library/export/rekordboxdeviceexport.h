#pragma once

#include <QList>
#include <QObject>
#include <QString>
#include <QStringList>

class QProcess;
class QProgressDialog;

namespace mixxx {

/// Writes a rekordbox *device* export - a USB stick that CDJ/XDJ players can
/// read directly, with beat grids, cues and waveforms.
///
/// Unlike the XML export in rekordboxexport.h this produces the Pioneer
/// database itself (PIONEER/rekordbox/export.pdb plus per-track ANLZ files), so
/// no detour through rekordbox is needed.
///
/// The heavy lifting lives in the Python package `rbexport`, next to the stem
/// tools: it needs an FFT band split for the waveform data, which is exactly
/// what numpy and the bundled ffmpeg are already there for. This class only
/// drives that process and reports progress.
class RekordboxDeviceExport : public QObject {
    Q_OBJECT

  public:
    explicit RekordboxDeviceExport(QObject* parent = nullptr);
    ~RekordboxDeviceExport() override;

    /// Start the export. Returns false if it could not even be launched, in
    /// which case the user has already been told why.
    bool start(const QString& databasePath,
            const QString& targetDir,
            const QList<int>& crateIds,
            int trackCount);

  private slots:
    void onReadyRead();
    void onFinished(int exitCode, int exitStatus);
    void onErrorOccurred(int error);
    void onCancelled();

  private:
    void cleanUp();

    QProcess* m_pProcess;
    QProgressDialog* m_pProgress;
    QString m_targetDir;
    QStringList m_output;
    int m_trackCount;
    bool m_cancelled;
};

} // namespace mixxx
