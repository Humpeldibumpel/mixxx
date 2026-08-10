#include "library/stemconverter.h"

#include <QFileInfo>
#include <QProcess>

#include "library/trackcollection.h"
#include "library/trackcollectionmanager.h"
#include "moc_stemconverter.cpp"
#include "track/track.h"
#include "track/trackref.h"

namespace {
// Paths to the external converter for this build's machine — adjust here if the
// stem-tools location changes.
const QString kPython = QStringLiteral(
        "C:\\mixxx-build\\stem-tools\\venv\\Scripts\\python.exe");
const QString kScript = QStringLiteral(
        "C:\\mixxx-build\\stem-tools\\song2stem.py");
} // namespace

StemConverter::StemConverter(TrackCollectionManager* pTrackCollectionManager,
        QObject* parent)
        : QObject(parent),
          m_pTrackCollectionManager(pTrackCollectionManager),
          m_pProcess(nullptr),
          m_busy(false),
          m_done(0),
          m_total(0) {
}

void StemConverter::enqueue(const QString& sourcePath,
        CrateId crateId,
        const QString& artist,
        const QString& title) {
    const QFileInfo fi(sourcePath);
    Job job;
    job.source = sourcePath;
    job.stemPath = fi.absolutePath() + QChar('/') + fi.completeBaseName() +
            QStringLiteral(".stem.mp4");
    job.crateId = crateId;
    job.artist = artist;
    job.title = title;
    m_queue.append(job);
    m_total++;
    emit progress(m_done, m_total);
    if (!m_busy) {
        startNext();
    }
}

void StemConverter::startNext() {
    if (m_queue.isEmpty()) {
        m_busy = false;
        m_done = 0;
        m_total = 0;
        emit queueEmpty();
        return;
    }
    m_busy = true;
    m_current = m_queue.takeFirst();
    m_pProcess = new QProcess(this);
    connect(m_pProcess,
            &QProcess::finished,
            this,
            &StemConverter::onProcessFinished);
    m_pProcess->start(kPython, {kScript, m_current.source, m_current.stemPath});
}

void StemConverter::onProcessFinished(int exitCode, QProcess::ExitStatus) {
    if (exitCode == 0 && QFileInfo::exists(m_current.stemPath)) {
        TrackPointer pStem = m_pTrackCollectionManager->getOrAddTrack(
                TrackRef::fromFilePath(m_current.stemPath));
        if (pStem) {
            if (!m_current.artist.isEmpty()) {
                pStem->setArtist(m_current.artist);
            }
            const QString baseTitle = m_current.title.isEmpty()
                    ? QFileInfo(m_current.stemPath).completeBaseName()
                    : m_current.title;
            pStem->setTitle(baseTitle + QStringLiteral(" [Stems]"));
            if (m_current.crateId.isValid()) {
                m_pTrackCollectionManager->internalCollection()->addCrateTracks(
                        m_current.crateId, {pStem->getId()});
            }
        }
    }
    m_done++;
    emit progress(m_done, m_total);
    if (m_pProcess) {
        m_pProcess->deleteLater();
        m_pProcess = nullptr;
    }
    startNext();
}
