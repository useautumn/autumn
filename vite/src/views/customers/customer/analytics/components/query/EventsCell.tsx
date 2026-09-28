import { Popover, PopoverContent, PopoverTrigger } from "@autumn/ui";
import { useAnalyticsContext } from "../../AnalyticsContext";
import { eventDisplayName } from "../../utils/eventFeatures";
import { EventsChecklist } from "./EventsChecklist";
import { StripCell } from "./StripCell";
import { MAX_SELECTED_EVENTS, useEventSelection } from "./useEventSelection";

const MAX_STACKED_DOTS = 3;

export const EventsCell = ({ className }: { className?: string }) => {
	const { features, eventColors } = useAnalyticsContext();
	const { selectedEventNames, hasExplicitSelection, resetSelection } =
		useEventSelection();

	const [firstEvent] = selectedEventNames;
	const extraCount = selectedEventNames.length - 1;

	return (
		<Popover>
			<PopoverTrigger asChild>
				<StripCell
					label="Events"
					className={className}
					isPlaceholder={!firstEvent}
					value={
						firstEvent ? (
							<>
								<span className="flex shrink-0 -space-x-0.5">
									{selectedEventNames.slice(0, MAX_STACKED_DOTS).map((name) => (
										<span
											key={name}
											className="size-2 rounded-[2px] bg-subtle ring-1 ring-interactive-secondary"
											style={{ background: eventColors[name] }}
										/>
									))}
								</span>
								<span className="truncate">
									{eventDisplayName({ eventName: firstEvent, features })}
								</span>
								{extraCount > 0 && (
									<span className="shrink-0 text-tertiary-foreground">
										+{extraCount} more
									</span>
								)}
							</>
						) : (
							"No events"
						)
					}
				/>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-[300px] p-3">
				<div className="flex items-center justify-between pb-3">
					<span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-subtle">
						Events
					</span>
					<span className="flex items-center gap-2 text-xs text-subtle">
						{selectedEventNames.length} of {MAX_SELECTED_EVENTS}
						{hasExplicitSelection && (
							<button
								type="button"
								onClick={resetSelection}
								className="text-tertiary-foreground hover:text-foreground"
							>
								Reset
							</button>
						)}
					</span>
				</div>
				<EventsChecklist />
			</PopoverContent>
		</Popover>
	);
};
