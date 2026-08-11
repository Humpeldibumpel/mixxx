#pragma once

#include <QList>
#include <QObject>
#include <QProcess>
#include <QString>

#include "library/trackset/crate/crateid.h"

class QProgressDialog;
class TrackCollectionManager;

/// Runs the external Demucs stem converter for queued tracks ONE AT A TIME, so
/// several requests (e.g. a multi-track selection) don't spawn parallel Demucs
/// processes and saturate the CPU. Owned by Library so it outlives the transient
/// track context menu that enqueues the jobs. When a conversion finishes the
/// resulting .stem.mp4 is imported, tagged "<title> [Stems]" (+ original artist)
/// so it sorts right below the original, and added to the given crate (if valid).
class StemConverter : public QObject {
    Q_OBJECT
  public:
    explicit StemConverter(TrackCollectionManager* pTrackCollectionManager,
            QObject* parent = nullptr);

    void enqueue(const QString& sourcePath,
            CrateId crateId,
            const QString& artist,
            const QString& title);

    /// Number of jobs still queued or in progress.
    int remaining() const {
        return m_queue.size() + (m_busy ? 1 : 0);
    }

  signals:
    void progress(int done, int total);
    void queueEmpty();

  private slots:
    void onProcessFinished(int exitCode, QProcess::ExitStatus exitStatus);
    void onErrorOccurred(QProcess::ProcessError error);
    /// Abort the whole queue (triggered by the progress window's Cancel button).
    void cancelAll();

  private:
    struct Job {
        QString source;
        QString stemPath;
        CrateId crateId;
        QString artist;
        QString title;
    };
    void startNext();
    void showProgress();
    /// Count the current job as done, advance the bar and start the next one.
    void finishJob();

    TrackCollectionManager* const m_pTrackCollectionManager;
    QProcess* m_pProcess;
    QProgressDialog* m_pProgress;
    QList<Job> m_queue;
    Job m_current;
    QString m_logPath;
    bool m_busy;
    int m_done;
    int m_total;
    int m_failed;
};
