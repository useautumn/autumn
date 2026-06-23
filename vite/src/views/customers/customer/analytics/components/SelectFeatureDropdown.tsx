import type { Feature } from "@autumn/shared";
import { FeatureType } from "@autumn/shared";
import { IconButton } from "@autumn/ui";
import { CaretDownIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";
import { cn } from "@/lib/utils";
import { useAnalyticsContext } from "../AnalyticsContext";
import { useAnalyticsQueryState } from "../hooks/useAnalyticsQueryState";
import { useEventNames } from "../hooks/useEventNames";

const MAX_NUM_SELECTED = 10;

type EventOption = {
	eventName: string;
	eventCount: number;
	linkedFeatures: Feature[];
	selected: boolean;
};

/** Gets all metered features and credit systems linked to this event name.
 *  First checks event_names array, then falls back to matching by feature ID. */
const getFeaturesForEventName = (
	eventName: string,
	features: Feature[],
): Feature[] => {
	// First, find features that have this event name in their event_names array
	const byEventName = features.filter(
		(feature) =>
			(feature.type === FeatureType.Metered ||
				feature.type === FeatureType.CreditSystem) &&
			feature.event_names?.includes(eventName),
	);

	if (byEventName.length > 0) {
		return byEventName;
	}

	// Fallback: if the "event name" is actually a feature ID, find that feature
	const byFeatureId = features.filter(
		(feature) =>
			(feature.type === FeatureType.Metered ||
				feature.type === FeatureType.CreditSystem) &&
			feature.id === eventName,
	);

	return byFeatureId;
};

/** Formats the feature label for display using feature name */
const formatFeatureLabel = (linkedFeatures: Feature[]): string | null => {
	if (linkedFeatures.length === 0) return null;
	if (linkedFeatures.length === 1) return linkedFeatures[0].name;
	return `${linkedFeatures[0].name} + ${linkedFeatures.length - 1} more`;
};

export const SelectFeatureDropdown = () => {
	const { features, setHasCleared } = useAnalyticsContext();
	const { queryStates } = useAnalyticsQueryState();
	const { eventNames: eventNamesData } = useEventNames({
		interval: queryStates.interval,
		start: queryStates.start,
		end: queryStates.end,
	});
	const [open, setOpen] = useState(false);
	const [searchValue, setSearchValue] = useState("");

	const [searchParams] = useSearchParams();
	const navigate = useNavigate();
	const location = useLocation();

	// Read current selected event names from query parameters
	const currentEventNames =
		searchParams.get("event_names")?.split(",").filter(Boolean) || [];

	// Show every ingested event; feature linkage only drives the optional label, not visibility
	const eventOptions: EventOption[] = useMemo(() => {
		return eventNamesData.map((item) => ({
			eventName: item.event_name,
			eventCount: item.event_count,
			linkedFeatures: getFeaturesForEventName(item.event_name, features),
			selected: currentEventNames.includes(item.event_name),
		}));
	}, [eventNamesData, features, currentEventNames]);

	// Filter options based on search (search both event name and feature ids)
	const filteredOptions = useMemo(() => {
		if (!searchValue) return eventOptions;
		const lowerSearch = searchValue.toLowerCase();
		return eventOptions.filter(
			(option) =>
				option.eventName.toLowerCase().includes(lowerSearch) ||
				option.linkedFeatures.some(
					(f) =>
						f.id.toLowerCase().includes(lowerSearch) ||
						f.name.toLowerCase().includes(lowerSearch),
				),
		);
	}, [eventOptions, searchValue]);

	// Helper function to update query parameters
	const updateQueryParams = (eventNames: string[]) => {
		const params = new URLSearchParams(location.search);

		// Clear feature_ids since we're now only using event_names
		params.delete("feature_ids");

		if (eventNames.length > 0) {
			params.set("event_names", eventNames.join(","));
		} else {
			params.delete("event_names");
		}

		navigate(`${location.pathname}?${params.toString()}`);
	};

	const numSelected = currentEventNames.length;

	const handleToggleItem = (option: EventOption) => {
		if (option.selected) {
			updateQueryParams(
				currentEventNames.filter((name) => name !== option.eventName),
			);
		} else {
			if (numSelected >= MAX_NUM_SELECTED) {
				toast.error(`You can only select up to ${MAX_NUM_SELECTED} events`);
			} else {
				updateQueryParams([...currentEventNames, option.eventName]);
			}
		}
	};

	const handleClear = () => {
		updateQueryParams([]);
		setHasCleared(true);
	};

	const hasNoResults = filteredOptions.length === 0;

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<IconButton
					variant="secondary"
					size="default"
					icon={<CaretDownIcon size={12} weight="bold" />}
					iconOrientation="right"
					className={cn(open && "btn-secondary-active")}
				>
					{numSelected > 0 ? `${numSelected} Selected` : "Select Events"}
				</IconButton>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-[300px]">
				{/* Search input */}
				<div className="flex items-center gap-2 px-2 py-1.5 border-b border-border">
					<MagnifyingGlassIcon className="size-4 text-subtle" />
					<input
						type="text"
						placeholder="Search events..."
						value={searchValue}
						onChange={(e) => setSearchValue(e.target.value)}
						onKeyDown={(e) => e.stopPropagation()}
						className="flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"
					/>
				</div>

				<div className="max-h-[300px] overflow-y-auto">
					{hasNoResults ? (
						<div className="py-4 text-center text-sm text-subtle">
							No events found.
						</div>
					) : (
						<DropdownMenuGroup>
							<DropdownMenuLabel className="text-xs text-subtle">
								Events
							</DropdownMenuLabel>
							{filteredOptions.map((option) => {
								const featureLabel = formatFeatureLabel(option.linkedFeatures);
								return (
									<DropdownMenuCheckboxItem
										key={option.eventName}
										checked={option.selected}
										onCheckedChange={() => handleToggleItem(option)}
										className="pl-2"
									>
										<div className="flex items-center gap-1.5 min-w-0">
											<span className="text-xs truncate">
												{option.eventName}
											</span>
											{featureLabel && (
												<span className="text-xs text-subtle truncate">
													({featureLabel})
												</span>
											)}
										</div>
									</DropdownMenuCheckboxItem>
								);
							})}
						</DropdownMenuGroup>
					)}
				</div>

				<div className="border-t border-border">
					<button
						type="button"
						onClick={handleClear}
						className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs text-tertiary-foreground hover:text-muted-foreground hover:bg-accent cursor-default"
					>
						Clear
					</button>
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
