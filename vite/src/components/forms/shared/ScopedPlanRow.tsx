import type { ReactNode } from "react";
import { CustomizePlanButton } from "./CustomizePlanButton";
import { type PlanRowAction, PlanRowActionsMenu } from "./PlanRowActionsMenu";

/** The scope picker, already wired to its own popover trigger. */
export type PlanRowScope = {
	picker: ReactNode;
};

export function ScopedPlanRow({
	children,
	scope,
	actions = [],
	onCustomize,
}: {
	children: ReactNode;
	scope?: PlanRowScope;
	actions?: PlanRowAction[];
	onCustomize?: () => void;
}) {
	return (
		<div className="flex items-center gap-2">
			{children}
			{onCustomize && <CustomizePlanButton onClick={onCustomize} />}
			{scope?.picker}
			<PlanRowActionsMenu actions={actions} />
		</div>
	);
}
