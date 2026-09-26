import { useAnalyticsContext } from "../../AnalyticsContext";
import { groupValueLabel } from "../../utils/displayLabels";

/** Which groups the chart hides, plus the labels to list them by. */
export const useGroupVisibility = ({ groupBy }: { groupBy: string }) => {
	const {
		availableGroupValues,
		hiddenGroupValues,
		setHiddenGroupValues,
		entityNames,
		customerNames,
		planNames,
		features,
	} = useAnalyticsContext();

	const groupValues: string[] = availableGroupValues;
	const hidden: Set<string> = hiddenGroupValues;

	const toggleValue = (value: string) =>
		setHiddenGroupValues((prev: Set<string>) => {
			const next = new Set(prev);
			if (next.has(value)) next.delete(value);
			else next.add(value);
			return next;
		});

	return {
		groupValues,
		hidden,
		shownCount: groupValues.filter((value) => !hidden.has(value)).length,
		isFiltered: hidden.size > 0,
		labelFor: (value: string) =>
			groupValueLabel({
				groupValue: value,
				groupBy,
				entityNames,
				customerNames,
				planNames,
				features,
			}),
		toggleValue,
		showAll: () => setHiddenGroupValues(new Set()),
	};
};
