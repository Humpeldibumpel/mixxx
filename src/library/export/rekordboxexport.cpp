#include "library/export/rekordboxexport.h"

#include <QColor>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QObject>
#include <QSet>
#include <QUrl>
#include <QXmlStreamWriter>

#include "track/cue.h"
#include "track/cueinfo.h"
#include "track/trackid.h"
#include "util/color/rgbcolor.h"

namespace {

// rekordbox expects "file://localhost/" + a percent-encoded absolute path
// (forward slashes and the drive-letter colon are kept unencoded).
QString rbLocation(const QString& path) {
    QString p = path;
    p.replace('\\', '/');
    return QStringLiteral("file://localhost/") +
            QString::fromLatin1(QUrl::toPercentEncoding(p, "/:"));
}

} // namespace

namespace mixxx {

RekordboxExportResult exportToRekordbox(
        const QString& targetDir,
        const QString& xmlFileName,
        const QList<QPair<QString, QList<TrackPointer>>>& playlists,
        bool copyAudio) {
    RekordboxExportResult result;

    const QDir dir(targetDir);
    QString mediaDir;
    if (copyAudio) {
        mediaDir = dir.filePath(QStringLiteral("Musik"));
        if (!QDir().mkpath(mediaDir)) {
            result.error = QObject::tr("Could not create folder \"%1\".").arg(mediaDir);
            return result;
        }
    }

    // Collect unique tracks (dedupe by TrackId) preserving first-seen order.
    QList<TrackPointer> uniqueTracks;
    QSet<TrackId> seenIds;
    for (const auto& pl : playlists) {
        for (const auto& pTrack : pl.second) {
            if (!pTrack) {
                continue;
            }
            const TrackId id = pTrack->getId();
            if (seenIds.contains(id)) {
                continue;
            }
            seenIds.insert(id);
            uniqueTracks.append(pTrack);
        }
    }

    QFile file(dir.filePath(xmlFileName));
    if (!file.open(QIODevice::WriteOnly | QIODevice::Truncate)) {
        result.error = QObject::tr("Could not write \"%1\".").arg(file.fileName());
        return result;
    }

    QXmlStreamWriter xml(&file);
    xml.setAutoFormatting(true);
    xml.writeStartDocument(QStringLiteral("1.0"));

    xml.writeStartElement(QStringLiteral("DJ_PLAYLISTS"));
    xml.writeAttribute(QStringLiteral("Version"), QStringLiteral("1.0.0"));

    xml.writeStartElement(QStringLiteral("PRODUCT"));
    xml.writeAttribute(QStringLiteral("Name"), QStringLiteral("rekordbox"));
    xml.writeAttribute(QStringLiteral("Version"), QStringLiteral("6.0.0"));
    xml.writeAttribute(QStringLiteral("Company"), QStringLiteral("AlphaTheta"));
    xml.writeEndElement();

    xml.writeStartElement(QStringLiteral("COLLECTION"));
    xml.writeAttribute(QStringLiteral("Entries"), QString::number(uniqueTracks.size()));

    // Helper to emit one POSITION_MARK.
    const auto writeMark = [&xml](const QString& name,
                                   int type,
                                   double start,
                                   bool hasEnd,
                                   double end,
                                   int num,
                                   const QColor& color) {
        xml.writeStartElement(QStringLiteral("POSITION_MARK"));
        xml.writeAttribute(QStringLiteral("Name"), name);
        xml.writeAttribute(QStringLiteral("Type"), QString::number(type));
        xml.writeAttribute(QStringLiteral("Start"), QString::number(start, 'f', 3));
        if (hasEnd) {
            xml.writeAttribute(QStringLiteral("End"), QString::number(end, 'f', 3));
        }
        xml.writeAttribute(QStringLiteral("Num"), QString::number(num));
        if (color.isValid()) {
            xml.writeAttribute(QStringLiteral("Red"), QString::number(color.red()));
            xml.writeAttribute(QStringLiteral("Green"), QString::number(color.green()));
            xml.writeAttribute(QStringLiteral("Blue"), QString::number(color.blue()));
        }
        xml.writeEndElement();
    };

    QSet<TrackId> writtenIds;

    for (const auto& pTrack : uniqueTracks) {
        const double sr = pTrack->getSampleRate().isValid()
                ? static_cast<double>(pTrack->getSampleRate().value())
                : 44100.0;
        const QString srcPath = pTrack->getLocation();
        QString loc = srcPath;
        if (copyAudio) {
            const QFileInfo fi(srcPath);
            const QString dest = QDir(mediaDir).filePath(fi.fileName());
            if (!QFile::exists(dest) && !QFile::copy(srcPath, dest)) {
                result.skipped.append(srcPath);
                continue;
            }
            loc = dest;
        } else if (!QFile::exists(srcPath)) {
            result.skipped.append(srcPath);
            continue;
        }

        xml.writeStartElement(QStringLiteral("TRACK"));
        xml.writeAttribute(QStringLiteral("TrackID"), pTrack->getId().toString());
        QString title = pTrack->getTitle();
        if (title.isEmpty()) {
            title = QFileInfo(srcPath).fileName();
        }
        xml.writeAttribute(QStringLiteral("Name"), title);
        xml.writeAttribute(QStringLiteral("Artist"), pTrack->getArtist());
        xml.writeAttribute(QStringLiteral("Album"), pTrack->getAlbum());
        xml.writeAttribute(QStringLiteral("Genre"), pTrack->getGenre());
        xml.writeAttribute(QStringLiteral("Kind"),
                QFileInfo(srcPath).suffix().toUpper() + QStringLiteral(" File"));
        xml.writeAttribute(QStringLiteral("TotalTime"),
                QString::number(qRound(pTrack->getDuration())));
        xml.writeAttribute(QStringLiteral("SampleRate"),
                QString::number(static_cast<int>(sr)));
        xml.writeAttribute(QStringLiteral("BitRate"),
                QString::number(pTrack->getBitrate()));
        if (pTrack->getBpm() > 0.0) {
            xml.writeAttribute(QStringLiteral("AverageBpm"),
                    QString::number(pTrack->getBpm(), 'f', 2));
        }
        if (!pTrack->getKeyText().isEmpty()) {
            xml.writeAttribute(QStringLiteral("Tonality"), pTrack->getKeyText());
        }
        xml.writeAttribute(QStringLiteral("Location"), rbLocation(loc));

        const QList<CuePointer> cues = pTrack->getCuePoints();

        // Pad slots already occupied by real hot cues.
        QSet<int> usedNums;
        for (const auto& pCue : cues) {
            if (pCue->getType() == CueType::HotCue && pCue->getHotCue() >= 0) {
                usedNums.insert(pCue->getHotCue());
            }
        }

        // Hot cues -> hotcue POSITION_MARK.
        for (const auto& pCue : cues) {
            if (pCue->getType() != CueType::HotCue) {
                continue;
            }
            const auto pos = pCue->getPosition();
            if (!pos.isValid() || pos.value() < 0 || pCue->getHotCue() < 0) {
                continue;
            }
            writeMark(pCue->getLabel(), 0, pos.value() / sr, false, 0.0,
                    pCue->getHotCue(), RgbColor::toQColor(pCue->getColor()));
            result.hotcues++;
        }

        // Main cue -> memory cue.
        for (const auto& pCue : cues) {
            if (pCue->getType() != CueType::MainCue) {
                continue;
            }
            const auto pos = pCue->getPosition();
            if (!pos.isValid() || pos.value() < 0) {
                continue;
            }
            writeMark(QString(), 0, pos.value() / sr, false, 0.0, -1, QColor());
            result.memoryCues++;
        }

        // Loops -> hotcue loop on the next free pad (rekordbox imports memory
        // loops from XML unreliably; hotcue loops show as real active loops).
        for (const auto& pCue : cues) {
            if (pCue->getType() != CueType::Loop) {
                continue;
            }
            const auto pos = pCue->getPosition();
            const auto endPos = pCue->getEndPosition();
            if (!pos.isValid() || pos.value() < 0 ||
                    !endPos.isValid() || endPos.value() <= pos.value()) {
                continue;
            }
            int num = -1;
            for (int n = 0; n < 8; ++n) {
                if (!usedNums.contains(n)) {
                    num = n;
                    usedNums.insert(n);
                    break;
                }
            }
            writeMark(pCue->getLabel(), 4, pos.value() / sr, true,
                    endPos.value() / sr, num, RgbColor::toQColor(pCue->getColor()));
            result.loops++;
        }

        xml.writeEndElement(); // TRACK
        writtenIds.insert(pTrack->getId());
        result.tracks++;
    }

    xml.writeEndElement(); // COLLECTION

    // PLAYLISTS: one node per crate/library selection.
    xml.writeStartElement(QStringLiteral("PLAYLISTS"));
    xml.writeStartElement(QStringLiteral("NODE"));
    xml.writeAttribute(QStringLiteral("Type"), QStringLiteral("0"));
    xml.writeAttribute(QStringLiteral("Name"), QStringLiteral("ROOT"));
    xml.writeAttribute(QStringLiteral("Count"), QString::number(playlists.size()));
    for (const auto& pl : playlists) {
        QStringList keys;
        for (const auto& pTrack : pl.second) {
            if (pTrack && writtenIds.contains(pTrack->getId())) {
                keys.append(pTrack->getId().toString());
            }
        }
        xml.writeStartElement(QStringLiteral("NODE"));
        xml.writeAttribute(QStringLiteral("Name"), pl.first);
        xml.writeAttribute(QStringLiteral("Type"), QStringLiteral("1"));
        xml.writeAttribute(QStringLiteral("KeyType"), QStringLiteral("0"));
        xml.writeAttribute(QStringLiteral("Entries"), QString::number(keys.size()));
        for (const QString& key : keys) {
            xml.writeStartElement(QStringLiteral("TRACK"));
            xml.writeAttribute(QStringLiteral("Key"), key);
            xml.writeEndElement();
        }
        xml.writeEndElement(); // NODE (playlist)
    }
    xml.writeEndElement(); // NODE (ROOT)
    xml.writeEndElement(); // PLAYLISTS

    xml.writeEndElement(); // DJ_PLAYLISTS
    xml.writeEndDocument();
    file.close();

    result.ok = !xml.hasError();
    if (!result.ok && result.error.isEmpty()) {
        result.error = QObject::tr("Error while writing the XML file.");
    }
    return result;
}

} // namespace mixxx
