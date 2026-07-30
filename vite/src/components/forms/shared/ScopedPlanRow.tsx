import type { ReactNode } from "react";
import { PlanScopeToggleButton } from "./PlanScopeToggleButton";

export type PlanRowScope = {
	open: boolean;
	onToggle: () => void;
	selector: ReactNode;
};

export function ScopedPlanRow({
	children,
	scope,
}: {
	children: ReactNode;
	scope?: PlanRowScope;
}) {
	return (
		<div className="space-y-1.5">
			<div className="flex items-center gap-2">
				{children}
				{scope && (
					<PlanScopeToggleButton open={scope.open} onClick={scope.onToggle} />
				)}
			</div>
			{scope?.open && (
				<div className="ml-4 border-l border-border/40 pl-3">
					{scope.selector}
				</div>
			)}
		</div>
	);
}
