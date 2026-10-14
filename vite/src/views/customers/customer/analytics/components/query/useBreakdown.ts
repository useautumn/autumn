import { useEffect } from "react";
import { useAnalyticsFilterState } from "../../hooks/useAnalyticsFilterState";
import { useAnalyticsQueryState } from "../../hooks/useAnalyticsQueryState";
import { SOURCE_FEATURE_GROUP } from "../../utils/displayLabels";

export const DEDUCTIONS_MODE = "deductions";
export const SUM_MODE = "sum";
export const COUNT_MODE = "count";

export const useBreakdown = () => {
	const { filterStates, setFilterStates } = useAnalyticsFilterState();
	const { queryStates, setQueryStates } = useAnalyticsQueryState();

	const groupBy = filterStates.group_by ?? null;
	const customerId = filterStates.customer_id;
	const isDeducted = queryStates.aggregate_on === "deducted" && !!customerId;
	const effectiveGroupBy =
		groupBy ?? (isDeducted ? SOURCE_FEATURE_GROUP : null);

	const updateGroupBy = (nextGroupBy: string | null) =>
		setFilterStates(
			nextGroupBy
				? { group_by: nextGroupBy }
				: { group_by: null, max_groups: null },
		);

	useEffect(() => {
		if (isDeducted && groupBy === "plan_id") updateGroupBy(null);
	});

	const changeMode = (mode: string) => {
		const toDeductions = mode === DEDUCTIONS_MODE;
		setQueryStates({
			aggregate_on: toDeductions ? "deducted" : null,
			measure: mode === COUNT_MODE ? "count" : null,
		});
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
		mode: isDeducted
			? DEDUCTIONS_MODE
			: queryStates.measure === "count"
				? COUNT_MODE
				: SUM_MODE,
		maxGroups: filterStates.max_groups,
		setMaxGroups: (maxGroups: number) =>
			setFilterStates({ max_groups: maxGroups }),
		fieldOptions,
		updateGroupBy,
		changeMode,
	};
};
