import { useCustomerStateContext } from "../CustomerStateProvider";
import { PlanSection, PlanSectionTitle } from "./tray/PlanSection";
import { PlanTrayAddRow } from "./tray/PlanTrayAddRow";
import { UnscheduledPlanRow } from "./UnscheduledPlanRow";

/** Ongoing plans: billed with the first phase and never ended by the schedule. */
export function CustomerStateUnscheduledPlans() {
	const { formValues, canMakeUnscheduled, handleAddUnscheduledPlan } =
		useCustomerStateContext();
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
			{unscheduledPlans.map((plan, planIndex) => (
				<UnscheduledPlanRow
					key={`unscheduled-${planIndex}-${plan.productId || "empty"}`}
					planIndex={planIndex}
				/>
			))}
			{canMakeUnscheduled && (
				<PlanTrayAddRow
					label="Add ongoing plan"
					onClick={handleAddUnscheduledPlan}
				/>
			)}
		</PlanSection>
	);
}
