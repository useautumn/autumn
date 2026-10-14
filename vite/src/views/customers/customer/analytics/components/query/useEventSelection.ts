import { toast } from "sonner";
import { useAnalyticsFilterState } from "../../hooks/useAnalyticsFilterState";
import { useSelectedEventNames } from "../../hooks/useSelectedEventNames";

export const MAX_SELECTED_EVENTS = 10;

export const useEventSelection = () => {
	const { setFilterStates } = useAnalyticsFilterState();
	const { selectedEventNames, hasExplicitSelection } = useSelectedEventNames();

	const updateSelection = (nextEventNames: string[]) =>
		setFilterStates({
			event_names: nextEventNames.length > 0 ? nextEventNames : null,
			feature_ids: null,
		});

	const toggleEvent = (eventName: string) => {
		if (selectedEventNames.includes(eventName)) {
			updateSelection(selectedEventNames.filter((name) => name !== eventName));
			return;
		}
		if (selectedEventNames.length >= MAX_SELECTED_EVENTS) {
			toast.error(`You can only select up to ${MAX_SELECTED_EVENTS} events`);
			return;
		}
		updateSelection([...selectedEventNames, eventName]);
	};

	return {
		selectedEventNames,
		hasExplicitSelection,
		toggleEvent,
		resetSelection: () => updateSelection([]),
	};
};
