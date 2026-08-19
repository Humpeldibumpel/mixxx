#include "library/export/rekordboxdeviceexport.h"

#include <QDir>
#include <QFileInfo>
#include <QMessageBox>
#include <QProcess>
#include <QProgressDialog>
#include <QRegularExpression>

#include "moc_rekordboxdeviceexport.cpp"

namespace {

// Same lookup as StemConverter: the portable launcher sets MIXXX_STEM_TOOLS,
// otherwise fall back to the dev machine's path. The rbexport package is
// shipped alongside the stem scripts because it shares their venv and ffmpeg.
QString toolsDir() {
    return qEnvironmentVariable("MIXXX_STEM_TOOLS",
            QStringLiteral("C:/mixxx-build/stem-tools"));
}

} // namespace

namespace mixxx {

RekordboxDeviceExport::RekordboxDeviceExport(QObject* parent)
        : QObject(parent),
          m_pProcess(nullptr),
          m_pProgress(nullptr),
          m_trackCount(0),
          m_cancelled(false) {
}

RekordboxDeviceExport::~RekordboxDeviceExport() {
    cleanUp();
}

bool RekordboxDeviceExport::start(const QString& databasePath,
        const QString& targetDir,
        const QList<int>& crateIds,
        int trackCount) {
    const QString dir = toolsDir();
    const QString python = dir + QStringLiteral("/venv/Scripts/python.exe");
    const QString package = dir + QStringLiteral("/rbexport/export_usb.py");

    // Fail loudly rather than letting the process silently not start.
    if (!QFileInfo::exists(python) || !QFileInfo::exists(package)) {
        const QString missing = QFileInfo::exists(python) ? package : python;
        QMessageBox::warning(nullptr,
                tr("Export to rekordbox (USB device)"),
                tr("The device exporter was not found:\n%1\n\n"
                   "Make sure the \"stem-tools\" folder sits next to Mixxx and "
                   "was copied completely. When moving the extracted folder over "
                   "a network / file server, antivirus can strip the bundled "
                   "python.exe — transfer the ZIP and unzip it on the target PC "
                   "instead.")
                        .arg(QDir::toNativeSeparators(missing)));
        return false;
    }

    m_targetDir = targetDir;
    m_trackCount = trackCount;
    m_cancelled = false;
    m_output.clear();

    QStringList args;
    args << QStringLiteral("-m") << QStringLiteral("rbexport.export_usb")
         << databasePath << targetDir;
    for (int id : crateIds) {
        args << QString::number(id);
    }

    m_pProgress = new QProgressDialog();
    m_pProgress->setWindowTitle(tr("Export to rekordbox (USB device)"));
    m_pProgress->setWindowModality(Qt::NonModal);
    m_pProgress->setLabelText(tr("Preparing…"));
    m_pProgress->setMinimum(0);
    m_pProgress->setMaximum(trackCount > 0 ? trackCount : 0);
    m_pProgress->setValue(0);
    m_pProgress->setAutoClose(false);
    m_pProgress->setAutoReset(false);
    connect(m_pProgress, &QProgressDialog::canceled, this, &RekordboxDeviceExport::onCancelled);
    m_pProgress->show();

    m_pProcess = new QProcess(this);
    m_pProcess->setWorkingDirectory(dir);
    m_pProcess->setProcessChannelMode(QProcess::MergedChannels);
    connect(m_pProcess, &QProcess::readyReadStandardOutput,
            this, &RekordboxDeviceExport::onReadyRead);
    connect(m_pProcess,
            QOverload<int, QProcess::ExitStatus>::of(&QProcess::finished),
            this,
            [this](int code, QProcess::ExitStatus status) {
                onFinished(code, static_cast<int>(status));
            });
    connect(m_pProcess, &QProcess::errorOccurred, this, [this](QProcess::ProcessError e) {
        onErrorOccurred(static_cast<int>(e));
    });
    m_pProcess->start(python, args);
    return true;
}

void RekordboxDeviceExport::onReadyRead() {
    if (!m_pProcess) {
        return;
    }
    // The exporter prints one "[n/total] Artist - Title" line per track.
    static const QRegularExpression progressLine(
            QStringLiteral("^\\[(\\d+)/(\\d+)\\]\\s*(.*)$"));
    const QString chunk = QString::fromLocal8Bit(m_pProcess->readAllStandardOutput());
    const QStringList lines = chunk.split(QChar('\n'), Qt::SkipEmptyParts);
    for (const QString& raw : lines) {
        const QString line = raw.trimmed();
        if (line.isEmpty()) {
            continue;
        }
        m_output << line;
        const auto match = progressLine.match(line);
        if (match.hasMatch() && m_pProgress) {
            m_pProgress->setValue(match.captured(1).toInt());
            m_pProgress->setLabelText(match.captured(3));
        }
    }
}

void RekordboxDeviceExport::onCancelled() {
    m_cancelled = true;
    if (m_pProcess && m_pProcess->state() != QProcess::NotRunning) {
        m_pProcess->kill();
    }
}

void RekordboxDeviceExport::onErrorOccurred(int error) {
    if (static_cast<QProcess::ProcessError>(error) != QProcess::FailedToStart) {
        return; // finished() reports everything else
    }
    QMessageBox::critical(nullptr,
            tr("Export to rekordbox (USB device)"),
            tr("The exporter could not be started."));
    cleanUp();
    deleteLater();
}

void RekordboxDeviceExport::onFinished(int exitCode, int exitStatus) {
    const bool ok = exitCode == 0 &&
            static_cast<QProcess::ExitStatus>(exitStatus) == QProcess::NormalExit;
    // Read the flag BEFORE cleanUp(): closing a QProgressDialog makes it emit
    // canceled() itself, which would otherwise set m_cancelled right here and
    // turn every finished export into a "cancelled" report.
    const bool wasCancelled = m_cancelled;
    cleanUp();

    if (wasCancelled) {
        QMessageBox::information(nullptr,
                tr("Export to rekordbox (USB device)"),
                tr("Export cancelled. The target folder may contain a partial "
                   "export — the stick is not usable until you run the export "
                   "again and let it finish."));
        deleteLater();
        return;
    }

    if (!ok) {
        // Show the tail of the output: that is where the traceback lands.
        const QStringList tail = m_output.mid(qMax(0, m_output.size() - 12));
        QMessageBox::critical(nullptr,
                tr("Export to rekordbox (USB device)"),
                tr("Export failed.\n\n%1").arg(tail.join(QChar('\n'))));
        deleteLater();
        return;
    }

    QMessageBox::information(nullptr,
            tr("Export to rekordbox (USB device)"),
            tr("Wrote a rekordbox device export to:\n%1\n\n"
               "Eject the drive and plug it into the player — no import into "
               "rekordbox is needed.\n\n"
               "This writes the Pioneer database directly. It is built from a "
               "reverse-engineered format, so verify on your own player before "
               "relying on it for a gig.")
                    .arg(QDir::toNativeSeparators(m_targetDir)));
    deleteLater();
}

void RekordboxDeviceExport::cleanUp() {
    if (m_pProgress) {
        // Disconnect first: close() emits canceled().
        m_pProgress->disconnect(this);
        m_pProgress->close();
        m_pProgress->deleteLater();
        m_pProgress = nullptr;
    }
    if (m_pProcess) {
        m_pProcess->disconnect(this);
        if (m_pProcess->state() != QProcess::NotRunning) {
            m_pProcess->kill();
            m_pProcess->waitForFinished(2000);
        }
        m_pProcess->deleteLater();
        m_pProcess = nullptr;
    }
}

} // namespace mixxx
