import {
	IconButton,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { PencilSimpleIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { type PlanRowAction, PlanRowActionsMenu } from "./PlanRowActionsMenu";

const TOOLTIP_DELAY_MS = 250;

/** The scope picker, already wired to its own popover trigger. */
export type PlanRowScope = {
	picker: ReactNode;
};

function CustomizePlanButton({ onClick }: { onClick: () => void }) {
	return (
		<Tooltip delayDuration={TOOLTIP_DELAY_MS}>
			<TooltipTrigger asChild>
				<IconButton
					aria-label="Customize plan"
					className="size-6 shrink-0 text-tertiary-foreground"
					icon={<PencilSimpleIcon />}
					onClick={onClick}
					size="sm"
					type="button"
					variant="muted"
				/>
			</TooltipTrigger>
			<TooltipContent side="top">Customize</TooltipContent>
		</Tooltip>
	);
}

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
