import { Popover, PopoverContent, PopoverTrigger } from "@autumn/ui";
import { overlayLabelClassName } from "@autumn/ui/lib/overlay-classes";
import { useAnalyticsContext } from "../../AnalyticsContext";
import { eventDisplayName } from "../../utils/eventFeatures";
import { FilterTriggerButton } from "../FilterTriggerButton";
import { EventsChecklist } from "./EventsChecklist";
import { SeriesSwatch } from "./SeriesSwatch";
import { MAX_SELECTED_EVENTS, useEventSelection } from "./useEventSelection";

const MAX_TRIGGER_SWATCHES = 3;

export const EventsCell = () => {
	const { features, eventColors } = useAnalyticsContext();
	const { selectedEventNames, hasExplicitSelection, resetSelection } =
		useEventSelection();

	const [firstEvent] = selectedEventNames;
	const extraCount = selectedEventNames.length - 1;

	return (
		<Popover>
			<PopoverTrigger asChild>
				<FilterTriggerButton
					label="Events"
					value={
						firstEvent ? (
							<>
								<span className="flex shrink-0 gap-0.5 pl-0.5">
									{selectedEventNames
										.slice(0, MAX_TRIGGER_SWATCHES)
										.map((name) => (
											<SeriesSwatch key={name} color={eventColors[name]} />
										))}
								</span>
								<span className="truncate">
									{eventDisplayName({ eventName: firstEvent, features })}
								</span>
								{extraCount > 0 && (
									<span className="shrink-0 text-tertiary-foreground">
										+{extraCount}
									</span>
								)}
							</>
						) : (
							"None"
						)
					}
				/>
			</PopoverTrigger>
			<PopoverContent align="start" className="flex w-[300px] flex-col p-1">
				<EventsChecklist
					header={
						<div className="flex items-center justify-between">
							<span className={overlayLabelClassName}>
								{selectedEventNames.length} of {MAX_SELECTED_EVENTS} selected
							</span>
							{hasExplicitSelection && (
								<button
									type="button"
									onClick={resetSelection}
									className="px-2 text-xs text-tertiary-foreground hover:text-foreground"
								>
									Reset
								</button>
							)}
						</div>
					}
				/>
			</PopoverContent>
		</Popover>
	);
};
