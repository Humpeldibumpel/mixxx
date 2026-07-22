#pragma once

#include <QList>
#include <QPair>
#include <QString>
#include <QStringList>

#include "track/track.h"

namespace mixxx {

/// Result summary of a rekordbox export.
struct RekordboxExportResult {
    bool ok = false;
    QString error;
    int tracks = 0;
    int hotcues = 0;
    int loops = 0;
    int memoryCues = 0;
    QStringList skipped;
};

/// Export the given named track lists (crates/library) to a rekordbox
/// "collection" XML (DJ_PLAYLISTS format) inside targetDir, including hot cues,
/// loops and memory cues. Each entry of `playlists` becomes one rekordbox
/// playlist. When copyAudio is true the audio files are copied into
/// targetDir/"Musik" and referenced there, producing a self-contained,
/// portable USB bundle.
RekordboxExportResult exportToRekordbox(
        const QString& targetDir,
        const QString& xmlFileName,
        const QList<QPair<QString, QList<TrackPointer>>>& playlists,
        bool copyAudio);

} // namespace mixxx
