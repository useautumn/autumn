import type { TrackParams } from "@autumn/shared";
import type {
	DeductionOptions,
	OverageBehaviour,
} from "../../../deduction/types/deductionOptions.js";

const DEFAULT_VALUE = 1;

// Row 65: "overflow" drops the balance floors like "allow" does; the spend
// limits it keeps authoritative are unit 5.
const isAllowBehaviour = (behaviour: OverageBehaviour): boolean =>
	behaviour === "allow" || behaviour === "overflow";

// Rows 36, 57, 65.
export const resolveDeductionOptions = ({
	body,
}: {
	body: TrackParams;
}): DeductionOptions => {
	const overageBehaviour: OverageBehaviour = body.overage_behavior ?? "cap";

	return {
		overageBehaviour,
		isAllow: isAllowBehaviour(overageBehaviour),
		isConsumption: (body.value ?? DEFAULT_VALUE) > 0,
	};
};
