/** Outer tray: headers and footer sit on it, rows on a raised surface inside. */
export const TABLE_TRAY_CLASS =
	"rounded-xl border border-table-tray-border bg-table-tray p-1 [&_[data-slot=table]]:border-separate [&_[data-slot=table]]:border-spacing-0";

/** Footer bar that sits on the tray below the rows. */
export const TABLE_TRAY_FOOTER_CLASS =
	"flex h-11 shrink-0 items-center justify-between gap-2 pr-1.5 pl-3";

/** Raised row surface for div-based tables; wrap any scroller inside it. */
export const TABLE_TRAY_SURFACE_CLASS =
	"rounded-lg border border-table-surface-border bg-table-surface overflow-hidden";

export const TABLE_TRAY_SURFACE_ROW_CLASS =
	"border-b border-table-row-divider last:border-b-0 hover:bg-table-row-hover";
