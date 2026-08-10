#include "library/stemconverter.h"

#include <QFileInfo>
#include <QProcess>
#include <QProgressDialog>

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
          m_pProgress(nullptr),
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
    } else {
        // A job is already running; just refresh the window's total.
        showProgress();
    }
}

void StemConverter::startNext() {
    if (m_queue.isEmpty()) {
        m_busy = false;
        m_done = 0;
        m_total = 0;
        if (m_pProgress) {
            m_pProgress->hide();
        }
        emit queueEmpty();
        return;
    }
    m_busy = true;
    m_current = m_queue.takeFirst();
    showProgress();
    m_pProcess = new QProcess(this);
    connect(m_pProcess,
            &QProcess::finished,
            this,
            &StemConverter::onProcessFinished);
    m_pProcess->start(kPython, {kScript, m_current.source, m_current.stemPath});
}

void StemConverter::showProgress() {
    if (!m_pProgress) {
        // Top-level, non-modal window: gives feedback without blocking Mixxx.
        m_pProgress = new QProgressDialog();
        m_pProgress->setWindowTitle(tr("Generating stems"));
        m_pProgress->setWindowModality(Qt::NonModal);
        m_pProgress->setMinimumDuration(0);
        m_pProgress->setAutoClose(false);
        m_pProgress->setAutoReset(false);
        m_pProgress->setCancelButtonText(tr("Cancel"));
        connect(m_pProgress,
                &QProgressDialog::canceled,
                this,
                &StemConverter::cancelAll);
    }
    const QString name = m_current.title.isEmpty()
            ? QFileInfo(m_current.source).completeBaseName()
            : m_current.title;
    m_pProgress->setMaximum(m_total);
    m_pProgress->setValue(m_done);
    m_pProgress->setLabelText(tr("Converting %1/%2:\n%3")
                    .arg(m_done + 1)
                    .arg(m_total)
                    .arg(name));
    m_pProgress->show();
}

void StemConverter::cancelAll() {
    m_queue.clear();
    if (m_pProcess) {
        // Detach first so the kill doesn't re-enter onProcessFinished().
        m_pProcess->disconnect(this);
        m_pProcess->kill();
        m_pProcess->deleteLater();
        m_pProcess = nullptr;
    }
    m_busy = false;
    m_done = 0;
    m_total = 0;
    if (m_pProgress) {
        m_pProgress->hide();
    }
    emit queueEmpty();
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
    if (m_pProgress) {
        m_pProgress->setValue(m_done);
    }
    if (m_pProcess) {
        m_pProcess->deleteLater();
        m_pProcess = nullptr;
    }
    startNext();
}
