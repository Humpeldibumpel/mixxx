#include "library/stemconverter.h"

#include <QFileInfo>
#include <QMessageBox>
#include <QProcess>
#include <QProgressDialog>

#include "library/trackcollection.h"
#include "library/trackcollectionmanager.h"
#include "moc_stemconverter.cpp"
#include "track/track.h"
#include "track/trackref.h"

namespace {
// The stem-tools directory: overridable via MIXXX_STEM_TOOLS (set by the
// portable launcher) so it doesn't have to live at the dev machine's path.
QString stemToolsDir() {
    return qEnvironmentVariable("MIXXX_STEM_TOOLS",
            QStringLiteral("C:/mixxx-build/stem-tools"));
}
} // namespace

StemConverter::StemConverter(TrackCollectionManager* pTrackCollectionManager,
        QObject* parent)
        : QObject(parent),
          m_pTrackCollectionManager(pTrackCollectionManager),
          m_pProcess(nullptr),
          m_pProgress(nullptr),
          m_busy(false),
          m_done(0),
          m_total(0),
          m_failed(0) {
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
        if (m_pProgress) {
            m_pProgress->hide();
        }
        if (m_failed > 0) {
            QMessageBox::warning(nullptr,
                    tr("Generate stems"),
                    tr("%1 of %2 track(s) could not be converted.\n\n"
                       "Details are in the log:\n%3")
                            .arg(m_failed)
                            .arg(m_total)
                            .arg(m_logPath));
        }
        m_done = 0;
        m_total = 0;
        m_failed = 0;
        emit queueEmpty();
        return;
    }
    m_busy = true;
    m_current = m_queue.takeFirst();

    const QString dir = stemToolsDir();
    const QString python = dir + QStringLiteral("/venv/Scripts/python.exe");
    const QString script = dir + QStringLiteral("/song2stem.py");

    // Fail loudly (and abort) if the converter isn't there — otherwise the
    // process would silently fail to start and the bar would hang at 0%.
    if (!QFileInfo::exists(python) || !QFileInfo::exists(script)) {
        const QString missing = QFileInfo::exists(python) ? script : python;
        QMessageBox::warning(nullptr,
                tr("Generate stems"),
                tr("The stem converter was not found:\n%1\n\n"
                   "Make sure the \"stem-tools\" folder sits next to Mixxx and "
                   "was copied completely. When moving the extracted folder over "
                   "a network / file server, antivirus can strip the bundled "
                   "python.exe — transfer the ZIP and unzip it on the target PC "
                   "instead.")
                        .arg(missing));
        cancelAll();
        return;
    }

    showProgress();

    m_logPath = dir + QStringLiteral("/stem-convert.log");
    m_pProcess = new QProcess(this);
    m_pProcess->setProcessChannelMode(QProcess::MergedChannels);
    m_pProcess->setStandardOutputFile(m_logPath); // fresh log per track
    connect(m_pProcess,
            &QProcess::finished,
            this,
            &StemConverter::onProcessFinished);
    connect(m_pProcess,
            &QProcess::errorOccurred,
            this,
            &StemConverter::onErrorOccurred);
    m_pProcess->start(python, {script, m_current.source, m_current.stemPath});
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
    m_failed = 0;
    if (m_pProgress) {
        m_pProgress->hide();
    }
    emit queueEmpty();
}

void StemConverter::onProcessFinished(int exitCode, QProcess::ExitStatus exitStatus) {
    bool ok = false;
    if (exitCode == 0 && exitStatus == QProcess::NormalExit &&
            QFileInfo::exists(m_current.stemPath)) {
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
            ok = true;
        }
    }
    if (!ok) {
        m_failed++;
    }
    finishJob();
}

void StemConverter::onErrorOccurred(QProcess::ProcessError error) {
    // A crash still delivers finished() afterwards, so let that path handle it
    // (and count the failure) to avoid advancing the queue twice.
    if (error != QProcess::FailedToStart) {
        return;
    }
    // FailedToStart means finished() will NOT come — handle it here.
    if (m_pProcess) {
        m_pProcess->disconnect(this);
    }
    m_failed++;
    finishJob();
}

void StemConverter::finishJob() {
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
