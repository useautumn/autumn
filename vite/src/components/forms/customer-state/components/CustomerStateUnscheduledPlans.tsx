import {
	InlineAction,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { InfoIcon, PlusIcon } from "@phosphor-icons/react";
import { useCustomerStateContext } from "../CustomerStateProvider";
import { UnscheduledPlanRow } from "./UnscheduledPlanRow";

/** Plans that start with the first phase and run across every phase after. */
export function CustomerStateUnscheduledPlans() {
	const { formValues, canMakeUnscheduled, handleAddUnscheduledPlan } =
		useCustomerStateContext();
	const { unscheduledPlans } = formValues;

	if (!canMakeUnscheduled && unscheduledPlans.length === 0) return null;

	return (
		<div>
			{unscheduledPlans.length > 0 && (
				<div className="mb-1.5 flex items-center gap-1.5">
					<span className="text-xs text-subtle">Unscheduled plans</span>
					<Tooltip>
						<TooltipTrigger asChild>
							<InfoIcon
								size={13}
								className="shrink-0 text-subtle hover:text-muted-foreground transition-colors cursor-default"
							/>
						</TooltipTrigger>
						<TooltipContent>
							Start with the first phase and run across every phase — never
							ended or replaced at a phase boundary
						</TooltipContent>
					</Tooltip>
				</div>
			)}

			<div className="space-y-1.5">
				{unscheduledPlans.map((plan, planIndex) => (
					<UnscheduledPlanRow
						key={`unscheduled-${planIndex}-${plan.productId || "empty"}`}
						planIndex={planIndex}
					/>
				))}
			</div>

			{canMakeUnscheduled && (
				<InlineAction
					icon={<PlusIcon size={11} />}
					onClick={handleAddUnscheduledPlan}
					className={unscheduledPlans.length > 0 ? "mt-1.5" : undefined}
				>
					Add unscheduled plan
				</InlineAction>
			)}
		</div>
	);
}
