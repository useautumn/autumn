export const POLICY_TABLE_COLUMNS =
	"md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.8fr)_72px]";

/** Below `md` a row is its name and actions, then each limit on its own full-width line. */
export const POLICY_ROW_LAYOUT =
	"grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-2 md:min-h-12";

export const POLICY_ROW_NAME = "order-1 md:order-none";

export const POLICY_ROW_ACTIONS = "order-2 justify-self-end md:order-none";

export const POLICY_ROW_DETAIL =
	"order-3 col-span-2 md:order-none md:col-span-1";

/** 44px tap targets on phones; the compact desktop size from `md`. */
export const TOUCH_TARGET = "h-11 min-w-11 md:h-6 md:min-w-0";

/** Inputs and default buttons size with the unlayered `.h-input`, so only `!` overrides it. */
export const TOUCH_TARGET_INPUT = "!h-11 md:!h-7";
