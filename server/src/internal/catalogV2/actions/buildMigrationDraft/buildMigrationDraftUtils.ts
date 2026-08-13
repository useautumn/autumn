import type {
	DiffedCustomizePlanV1,
	MigrationUpdatePlanCustomize,
	PlanFilter,
} from "@autumn/shared";
import type { MigrationTarget } from "./types";

/** Whether any branch of the filter pins a specific version. */
export const isVersionPinned = ({
	planFilter,
}: {
	planFilter: PlanFilter;
}): boolean => {
	if (planFilter.$or) {
		return planFilter.$or.some((branch) =>
			isVersionPinned({ planFilter: branch }),
		);
	}
	return planFilter.version !== undefined;
};

/** Sorted copy: planId alphabetical, then version ascending. */
export const sortTargetsByPlanVersion = ({
	targets,
}: {
	targets: MigrationTarget[];
}): MigrationTarget[] =>
	[...targets].sort(
		(left, right) =>
			left.planId.localeCompare(right.planId) || left.version - right.version,
	);

const previousPriceKey = ({
	previousPrice,
}: {
	previousPrice: MigrationTarget["previousPrice"];
}) => JSON.stringify(previousPrice);

/** Stamp previous_price only when every target shares one base price — one op can't carry mixed previous prices. */
export const stampPreviousPrice = ({
	customize,
	targets,
}: {
	customize: DiffedCustomizePlanV1;
	targets: MigrationTarget[];
}): MigrationUpdatePlanCustomize => {
	if (customize.price === undefined) return customize;

	const uniquePreviousPrices = new Set(
		targets.map((target) =>
			previousPriceKey({ previousPrice: target.previousPrice }),
		),
	);
	if (uniquePreviousPrices.size !== 1) return customize;

	return {
		...customize,
		previous_price: targets[0]!.previousPrice,
	};
};
