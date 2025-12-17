import type { Feature } from "@autumn/shared";
import { FeatureType, FeatureUsageType } from "@autumn/shared";
import { CaretDownIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import { IconButton } from "@/components/v2/buttons/IconButton";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";
import { cn } from "@/lib/utils";
import { useAnalyticsContext } from "../AnalyticsContext";
import {
	eventNameBelongsToFeature,
	getAllEventNames,
} from "../utils/getAllEventNames";

const MAX_NUM_SELECTED = 10;

export const SelectFeatureDropdown = ({
	classNames,
}: {
	classNames?: {
		trigger?: string;
	};
}) => {
	const { features, setHasCleared } = useAnalyticsContext();
	const [open, setOpen] = useState(false);
	const [searchValue, setSearchValue] = useState("");

	const [searchParams] = useSearchParams();
	const navigate = useNavigate();
	const location = useLocation();

	// Get all event names
	const allEventNames = getAllEventNames({ features });

	// Read current values from query parameters
	const currentFeatureIds =
		searchParams.get("feature_ids")?.split(",").filter(Boolean) || [];
	const currentEventNames =
		searchParams.get("event_names")?.split(",").filter(Boolean) || [];

	// Helper function to update query parameters
	const updateQueryParams = (featureIds: string[], eventNames: string[]) => {
		const params = new URLSearchParams(location.search);

		if (featureIds.length > 0) {
			params.set("feature_ids", featureIds.join(","));
		} else {
			params.delete("feature_ids");
		}

		if (eventNames.length > 0) {
			params.set("event_names", eventNames.join(","));
		} else {
			params.delete("event_names");
		}

		navigate(`${location.pathname}?${params.toString()}`);
	};

	const numSelected = currentFeatureIds.length + currentEventNames.length;

	// Create combined options for search
	const featureOptions = features
		.filter(
			(feature: Feature) =>
				feature.type === FeatureType.Metered &&
				feature.config.usage_type === FeatureUsageType.Single,
		)
		.map((feature: Feature) => ({
			type: "feature" as const,
			id: feature.id,
			name: feature.name,
			selected: currentFeatureIds.includes(feature.id),
		}));

	const eventOptions = allEventNames
		.filter((eventName: string) =>
			eventNameBelongsToFeature({ eventName, features }),
		)
		.map((eventName: string) => ({
			type: "event" as const,
			id: eventName,
			name: eventName,
			selected: currentEventNames.includes(eventName),
		}));

	const allOptions = [...featureOptions, ...eventOptions];

	// Filter options based on search
	const filteredOptions = allOptions.filter((option) =>
		option.name.toLowerCase().includes(searchValue.toLowerCase()),
	);

	const filteredFeatures = filteredOptions.filter(
		(option) => option.type === "feature",
	);
	const filteredEvents = filteredOptions.filter(
		(option) => option.type === "event",
	);

	const handleToggleItem = (option: (typeof allOptions)[0]) => {
		if (option.type === "feature") {
			if (option.selected) {
				updateQueryParams(
					currentFeatureIds.filter((id: string) => id !== option.id),
					currentEventNames,
				);
			} else {
				if (numSelected === MAX_NUM_SELECTED) {
					toast.error(
						`You can only select up to ${MAX_NUM_SELECTED} events/features`,
					);
				} else {
					updateQueryParams(
						[...currentFeatureIds, option.id],
						currentEventNames,
					);
				}
			}
		} else {
			if (option.selected) {
				updateQueryParams(
					currentFeatureIds,
					currentEventNames.filter((name: string) => name !== option.id),
				);
			} else {
				if (numSelected === MAX_NUM_SELECTED) {
					toast.error(
						`You can only select up to ${MAX_NUM_SELECTED} events/features`,
					);
				} else {
					updateQueryParams(currentFeatureIds, [
						...currentEventNames,
						option.id,
					]);
				}
			}
		}
	};

	const handleClear = () => {
		updateQueryParams([], []);
		setHasCleared(true);
	};

	const hasNoResults =
		filteredFeatures.length === 0 && filteredEvents.length === 0;

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<IconButton
					variant="secondary"
					size="default"
					icon={<CaretDownIcon size={12} weight="bold" />}
					iconOrientation="right"
					className={cn(classNames?.trigger, open && "btn-secondary-active")}
				>
					{numSelected > 0 ? `${numSelected} Selected` : "Default Features"}
				</IconButton>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-[240px]">
				{/* Search input */}
				<div className="flex items-center gap-2 px-2 py-1.5 border-b border-border">
					<MagnifyingGlassIcon className="size-4 text-t4" />
					<input
						type="text"
						placeholder="Search..."
						value={searchValue}
						onChange={(e) => setSearchValue(e.target.value)}
						onKeyDown={(e) => e.stopPropagation()}
						className="flex-1 bg-transparent text-sm outline-none placeholder:text-t4"
					/>
				</div>

				<div className="max-h-[300px] overflow-y-auto">
					{hasNoResults ? (
						<div className="py-4 text-center text-sm text-t4">
							No results found.
						</div>
					) : (
						<>
							{filteredFeatures.length > 0 && (
								<DropdownMenuGroup>
									<DropdownMenuLabel className="text-xs text-t4">
										Features
									</DropdownMenuLabel>
									{filteredFeatures.map((option) => (
										<DropdownMenuCheckboxItem
											key={`feature-${option.id}`}
											checked={option.selected}
											onCheckedChange={() => handleToggleItem(option)}
											onSelect={(e) => e.preventDefault()}
										>
											<span className="text-xs">{option.name}</span>
										</DropdownMenuCheckboxItem>
									))}
								</DropdownMenuGroup>
							)}

							{filteredEvents.length > 0 && (
								<>
									{filteredFeatures.length > 0 && <DropdownMenuSeparator />}
									<DropdownMenuGroup>
										<DropdownMenuLabel className="text-xs text-t4">
											Events
										</DropdownMenuLabel>
										{filteredEvents.map((option, index) => (
											<DropdownMenuCheckboxItem
												key={`event-${option.id}-${index}`}
												checked={option.selected}
												onCheckedChange={() => handleToggleItem(option)}
												onSelect={(e) => e.preventDefault()}
											>
												<span className="text-xs">{option.name}</span>
											</DropdownMenuCheckboxItem>
										))}
									</DropdownMenuGroup>
								</>
							)}
						</>
					)}
				</div>

				<div className="border-t border-border p-2">
					<div className="flex items-center justify-between gap-2">
						<Button variant="secondary" size="sm" onClick={handleClear}>
							Clear
						</Button>
					</div>
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
