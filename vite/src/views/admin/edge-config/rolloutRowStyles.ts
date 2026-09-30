/** Row actions fade in on hover where a pointer can hover; on touch screens they are always shown. */
export const ROW_ACTIONS_REVEAL =
	"transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:opacity-0";

/** Below `md` a row is two lines: what it is and its actions, then its detail and status. */
export const ROW_LAYOUT =
	"grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 md:h-12 md:py-0";

export const ROW_HEADER_LAYOUT =
	"hidden h-9 items-center gap-x-4 px-4 text-[11px] uppercase tracking-wide text-subtle md:grid";

export const LIST_FRAME =
	"divide-y overflow-clip rounded-lg border bg-interactive-secondary";

export const LIST_EMPTY =
	"flex min-h-12 items-center px-4 py-3 text-sm text-tertiary-foreground";
