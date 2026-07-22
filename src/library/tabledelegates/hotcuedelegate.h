#pragma once

#include "library/tabledelegates/tableitemdelegate.h"

/// Renders the "Hot Cue" column. The column value has the form
/// "a: label b: label ..." (see BaseTrackCache::getTrackValueForColumn).
/// Only the hotcue letters (a, b, c, ...) are drawn bold; the labels keep
/// the regular weight.
class HotcueDelegate : public TableItemDelegate {
    Q_OBJECT
  public:
    explicit HotcueDelegate(QTableView* pTrackTable);
    ~HotcueDelegate() override = default;

    void paintItem(
            QPainter* painter,
            const QStyleOptionViewItem& option,
            const QModelIndex& index) const override;
};
