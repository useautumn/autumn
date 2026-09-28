import { useScopeEntitySearch } from "@/views/customers2/customer/hooks/useScopeEntitySearch";
import { useCustomerStateContext } from "../CustomerStateProvider";
import { PlanScopeGroups } from "./tray/PlanScopeGroups";
import { PlanTrayAddRow } from "./tray/PlanTrayAddRow";
import { PlanTraySectionTitle } from "./tray/PlanTraySectionTitle";
import { UnscheduledPlanRow } from "./UnscheduledPlanRow";

/** Ongoing plans: billed with the first phase and never ended by the schedule. */
export function CustomerStateUnscheduledPlans() {
	const { formValues, canMakeUnscheduled, handleAddUnscheduledPlan } =
		useCustomerStateContext();
	const { hasEntities } = useScopeEntitySearch({ selectedEntityId: undefined });
	const { unscheduledPlans } = formValues;
	const pickerPlanIndex = unscheduledPlans.findIndex((plan) => !plan.productId);

	if (!canMakeUnscheduled && unscheduledPlans.length === 0) return null;

	return (
		<div className="flex flex-col gap-1.5">
			<PlanTraySectionTitle
				title="Ongoing plans"
				hint="Billed now & kept across every phase"
			/>
			<div className="flex flex-col">
				<PlanScopeGroups
					plans={unscheduledPlans}
					showHeaders={hasEntities}
					renderPlan={(planIndex) => (
						<UnscheduledPlanRow
							key={`unscheduled-${planIndex}`}
							planIndex={planIndex}
						/>
					)}
				/>
				{pickerPlanIndex === -1 ? (
					canMakeUnscheduled && (
						<PlanTrayAddRow
							label="Add ongoing plan"
							onClick={handleAddUnscheduledPlan}
						/>
					)
				) : (
					<UnscheduledPlanRow
						key={`unscheduled-${pickerPlanIndex}`}
						planIndex={pickerPlanIndex}
					/>
				)}
			</div>
		</div>
	);
}
