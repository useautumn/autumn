/** Outer tray: headers and footer sit on it, rows on a raised surface inside. */
export const TABLE_TRAY_CLASS =
	"rounded-xl border border-table-tray-border bg-table-tray p-1";

export const TABLE_TRAY_TABLE_CLASS =
	"[&_[data-slot=table]]:border-separate [&_[data-slot=table]]:border-spacing-0";

export const TABLE_TRAY_HEADER_ROW_CLASS =
	"bg-table-tray border-0 text-tertiary-foreground";

export const TABLE_TRAY_HEAD_CLASS =
	"h-8 px-2 bg-table-tray text-xs font-normal! text-tertiary-foreground";

export const TABLE_TRAY_ROW_CLASS = "group/row";

/** Cells draw the raised surface so its outer edge can be rounded under border-separate. */
export const TABLE_TRAY_CELL_CLASS =
	"bg-table-surface border-b border-table-row-divider first:border-l last:border-r first:border-l-table-surface-border last:border-r-table-surface-border group-first/row:border-t group-first/row:border-t-table-surface-border group-last/row:border-b-table-surface-border group-first/row:first:rounded-tl-lg group-first/row:last:rounded-tr-lg group-last/row:first:rounded-bl-lg group-last/row:last:rounded-br-lg group-hover/row:bg-table-row-hover group-data-[state=selected]/row:bg-active-primary";

/** Raised row surface for div-based tables; wrap any scroller inside it. */
export const TABLE_TRAY_SURFACE_CLASS =
	"rounded-lg border border-table-surface-border bg-table-surface overflow-hidden";

export const TABLE_TRAY_SURFACE_ROW_CLASS =
	"border-b border-table-row-divider last:border-b-0 hover:bg-table-row-hover";
