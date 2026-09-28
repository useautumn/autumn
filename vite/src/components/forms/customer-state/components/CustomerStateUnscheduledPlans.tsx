import { useCustomerStateContext } from "../CustomerStateProvider";
import { PlanScopeGroups } from "./tray/PlanScopeGroups";
import { PlanSection, PlanSectionTitle } from "./tray/PlanSection";
import { PlanTrayAddRow } from "./tray/PlanTrayAddRow";
import { useAddPlanScope } from "./tray/useAddPlanScope";
import { UnscheduledPlanRow } from "./UnscheduledPlanRow";

/** Ongoing plans: billed with the first phase and never ended by the schedule. */
export function CustomerStateUnscheduledPlans() {
	const { formValues, canMakeUnscheduled, handleAddUnscheduledPlan } =
		useCustomerStateContext();
	const addScope = useAddPlanScope();
	const { unscheduledPlans } = formValues;

	if (!canMakeUnscheduled && unscheduledPlans.length === 0) return null;

	return (
		<PlanSection
			header={
				<PlanSectionTitle
					title="Ongoing plans"
					hint="Billed now · kept across every phase"
				/>
			}
		>
			<PlanScopeGroups
				plans={unscheduledPlans}
				showHeaders={addScope.hasEntities}
				renderPlan={(planIndex) => (
					<UnscheduledPlanRow
						key={`unscheduled-${planIndex}-${unscheduledPlans[planIndex]?.productId || "empty"}`}
						planIndex={planIndex}
					/>
				)}
			/>
			{canMakeUnscheduled && (
				<PlanTrayAddRow
					label="Add ongoing plan"
					scope={addScope.picker}
					onClick={() =>
						handleAddUnscheduledPlan({ entityId: addScope.entityId })
					}
				/>
			)}
		</PlanSection>
	);
}
