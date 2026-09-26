import { useEffect } from "react";
import { useAnalyticsFilterState } from "../../hooks/useAnalyticsFilterState";
import { useAnalyticsQueryState } from "../../hooks/useAnalyticsQueryState";
import { SOURCE_FEATURE_GROUP } from "../../utils/displayLabels";

export const DEDUCTIONS_MODE = "deductions";
export const USAGE_MODE = "usage";

/** Group-by and usage/deductions state, shared by every breakdown control. */
export const useBreakdown = () => {
	const { filterStates, setFilterStates } = useAnalyticsFilterState();
	const { queryStates, setQueryStates } = useAnalyticsQueryState();

	const groupBy = filterStates.group_by ?? null;
	const customerId = filterStates.customer_id;
	// Without a customer the data hook never sends aggregate_on, so the
	// toggle reflects that rather than the raw URL.
	const isDeducted = queryStates.aggregate_on === "deducted" && !!customerId;
	// Deductions fall back to their source feature when nothing else is picked.
	const effectiveGroupBy =
		groupBy ?? (isDeducted ? SOURCE_FEATURE_GROUP : null);

	const updateGroupBy = (nextGroupBy: string | null) =>
		setFilterStates(
			nextGroupBy
				? { group_by: nextGroupBy }
				: { group_by: null, max_groups: null },
		);

	// Deductions can't be grouped by plan; the combination can still arrive via
	// a pasted URL or back-navigation.
	useEffect(() => {
		if (isDeducted && groupBy === "plan_id") updateGroupBy(null);
	});

	const changeMode = (mode: string) => {
		const toDeductions = mode === DEDUCTIONS_MODE;
		setQueryStates({ aggregate_on: toDeductions ? "deducted" : null });
		if (toDeductions && groupBy === "plan_id") updateGroupBy(null);
	};

	const fieldOptions = [
		{
			groupBy: "customer_id",
			disabledReason: customerId ? "1 customer picked" : undefined,
		},
		{ groupBy: "entity_id" },
		{
			groupBy: "plan_id",
			disabledReason: isDeducted ? "Not for deductions" : undefined,
		},
	];

	return {
		groupBy,
		effectiveGroupBy,
		customerId,
		isDeducted,
		mode: isDeducted ? DEDUCTIONS_MODE : USAGE_MODE,
		maxGroups: filterStates.max_groups,
		setMaxGroups: (maxGroups: number) =>
			setFilterStates({ max_groups: maxGroups }),
		fieldOptions,
		updateGroupBy,
		changeMode,
	};
};
