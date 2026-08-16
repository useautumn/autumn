import {
	type ApiPlanV1,
	diffPlanV1PreviousAttributes,
	type PlanChangeV0,
	type PlanPreviousAttributesV0,
} from "@autumn/shared";

export const buildPlanPreviousAttributes = ({
	from,
	to,
}: {
	from: ApiPlanV1;
	to: ApiPlanV1;
}): PlanChangeV0["previous_attributes"] =>
	diffPlanV1PreviousAttributes({
		from,
		to,
	}) as PlanPreviousAttributesV0 | null;
