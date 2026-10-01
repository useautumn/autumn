import { Separator } from "@autumn/ui";
import { useScopeEntitySearch } from "@/views/customers2/customer/hooks/useScopeEntitySearch";
import { useCustomerStateContext } from "../CustomerStateProvider";
import { PlanScopeGroups } from "./tray/PlanScopeGroups";
import { PlanTrayAddRow } from "./tray/PlanTrayAddRow";
import { PlanTraySectionTitle } from "./tray/PlanTraySectionTitle";
import { UnscheduledPlanRow } from "./UnscheduledPlanRow";

/** Ongoing plans: billed with the first phase and never ended by the schedule. */
export function CustomerStateUnscheduledPlans({
	withSeparator = false,
}: {
	withSeparator?: boolean;
}) {
	const { formValues, canMakeUnscheduled, handleAddUnscheduledPlan } =
		useCustomerStateContext();
	const { hasEntities } = useScopeEntitySearch({ selectedEntityId: undefined });
	const { unscheduledPlans } = formValues;

	if (!canMakeUnscheduled && unscheduledPlans.length === 0) return null;

	return (
		<>
			{withSeparator && <Separator />}
			<div className="flex flex-col gap-1.5">
				<PlanTraySectionTitle
					title="Ongoing plans"
					hint="Billed now & kept across every phase"
				/>
				<PlanScopeGroups
					plans={unscheduledPlans}
					showHeaders={hasEntities}
					renderPlan={(planIndex) => (
						<UnscheduledPlanRow
							key={`unscheduled-${planIndex}-${unscheduledPlans[planIndex]?.productId}-${unscheduledPlans[planIndex]?.entityId}`}
							planIndex={planIndex}
						/>
					)}
					addRow={
						canMakeUnscheduled && (
							<PlanTrayAddRow
								label="Add ongoing plan"
								onClick={handleAddUnscheduledPlan}
							/>
						)
					}
				/>
			</div>
		</>
	);
}
