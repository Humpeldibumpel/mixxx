#include "library/tabledelegates/hotcuedelegate.h"

#include <QAbstractTextDocumentLayout>
#include <QPainter>
#include <QRegularExpression>
#include <QTextDocument>

#include "moc_hotcuedelegate.cpp"

namespace {

// Matches a hotcue letter prefix at the start of the string or after a space,
// e.g. "a: " or "b: ". Only these letters are rendered bold; the labels that
// follow keep the regular weight. Mirrors the value built in
// BaseTrackCache::getTrackValueForColumn() ("a: label b: label ...").
const QRegularExpression kHotcuePrefixRe(
        QStringLiteral("(^|\\s)([a-zA-Z]+):"));

QString toBoldLetterHtml(const QString& text) {
    QString escaped = text.toHtmlEscaped();
    // Wrap the letter (capture group 2) in <b>...</b>, keep the leading
    // separator (group 1) and the colon untouched.
    escaped.replace(kHotcuePrefixRe, QStringLiteral("\\1<b>\\2</b>:"));
    return escaped;
}

}  // namespace

HotcueDelegate::HotcueDelegate(QTableView* pTableView)
        : TableItemDelegate(pTableView) {
}

void HotcueDelegate::paintItem(
        QPainter* painter,
        const QStyleOptionViewItem& option,
        const QModelIndex& index) const {
    paintItemBackground(painter, option, index);

    const QString text = index.data().toString();
    if (text.isEmpty()) {
        return;
    }

    QTextDocument doc;
    doc.setDefaultFont(option.font);
    doc.setDocumentMargin(0);
    QColor textColor = (option.state & QStyle::State_Selected)
            ? option.palette.highlightedText().color()
            : option.palette.text().color();
    doc.setDefaultStyleSheet(
            QStringLiteral("body { color: %1; }").arg(textColor.name()));
    doc.setHtml(QStringLiteral("<body>") + toBoldLetterHtml(text) +
            QStringLiteral("</body>"));
    doc.setTextWidth(option.rect.width());

    painter->save();
    // Vertically center the (single-line) text within the cell.
    const qreal yOffset = (option.rect.height() - doc.size().height()) / 2.0;
    painter->translate(option.rect.left(), option.rect.top() + qMax(0.0, yOffset));
    QRect clip(0, 0, option.rect.width(), option.rect.height());
    painter->setClipRect(clip);
    QAbstractTextDocumentLayout::PaintContext ctx;
    ctx.clip = clip;
    doc.documentLayout()->draw(painter, ctx);
    painter->restore();
}
