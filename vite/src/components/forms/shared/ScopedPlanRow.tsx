import type { ReactNode } from "react";

/** The scope picker, already wired to its own popover trigger. */
export type PlanRowScope = {
	picker: ReactNode;
};

export function ScopedPlanRow({
	children,
	scope,
}: {
	children: ReactNode;
	scope?: PlanRowScope;
}) {
	return (
		<div className="flex items-center gap-2">
			{children}
			{scope?.picker}
		</div>
	);
}
