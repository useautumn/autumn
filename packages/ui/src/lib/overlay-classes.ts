export const overlaySurfaceClassName =
	"rounded-xl border border-overlay-border bg-overlay text-muted-foreground shadow-overlay";

export const overlayMotionClassName =
	"duration-100 origin-(--transform-origin) data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1";

export const overlayItemLayoutClassName =
	"relative flex min-h-[30px] cursor-default select-none items-center gap-2 rounded-lg px-2 py-1 text-sm text-muted-foreground outline-hidden [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5 [&_svg:not([class*='text-'])]:text-tertiary-foreground";

export const overlayItemClassName = `${overlayItemLayoutClassName} data-disabled:pointer-events-none data-disabled:opacity-50`;

export const overlayItemHighlightClassName =
	"focus:bg-overlay-hover focus:text-foreground data-highlighted:bg-overlay-hover data-highlighted:text-foreground";

export const overlayItemIndicatorClassName =
	"pointer-events-none absolute right-2.5 flex items-center justify-center";

export const overlayLabelClassName =
	"px-2 pt-1.5 pb-1 text-xs font-medium text-tertiary-foreground";

export const overlaySeparatorClassName = "-mx-1 my-1 h-px bg-overlay-separator";

export const overlayShortcutClassName =
	"ml-auto pl-3 text-xs text-tertiary-foreground";
