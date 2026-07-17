import { InternalError } from "@autumn/shared";

export const assertPooledContributionAmount = ({
	field,
	value,
}: {
	field: "currentCycleContribution" | "nextCycleContribution";
	value: number;
}) => {
	if (Number.isFinite(value) && value >= 0) return;

	throw new InternalError({
		message: `${field} must be finite and non-negative`,
		data: { field, value },
	});
};
