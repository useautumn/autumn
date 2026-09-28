import type { ComponentProps } from "react";

/** Invisible anchor for a scope picker opened from the row menu. */
export function ScopeMenuAnchor(props: ComponentProps<"button">) {
	return (
		<button
			type="button"
			tabIndex={-1}
			aria-hidden
			{...props}
			className="pointer-events-none -mr-2 size-0 shrink-0 overflow-hidden"
		/>
	);
}
