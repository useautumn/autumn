import { Popover, PopoverContent, PopoverTrigger } from "@autumn/ui";
import {
	overlayLabelClassName,
	overlaySeparatorClassName,
} from "@autumn/ui/lib/overlay-classes";
import { useState } from "react";
import { useAnalyticsContext } from "../../AnalyticsContext";
import { groupByLabel } from "../../utils/displayLabels";
import { FilterTriggerButton } from "../FilterTriggerButton";
import { OverlaySearchInput } from "../OverlaySearchInput";
import { GroupValueChecklist } from "./GroupValueChecklist";
import { MaxGroupsInput } from "./MaxGroupsInput";
import { OptionRow } from "./OptionRow";
import { useBreakdown } from "./useBreakdown";
import { useGroupVisibility } from "./useGroupVisibility";

const PROPERTY_SEARCH_THRESHOLD = 5;

const Separator = () => <span className={overlaySeparatorClassName} />;

/** Summarises the grouping as "Plan · 3 of 4" when some groups are hidden. */
const GroupByValue = ({ groupBy }: { groupBy: string }) => {
	const { groupValues, shownCount, isFiltered } = useGroupVisibility({
		groupBy,
	});
	return (
		<>
			<span className="truncate">{groupByLabel({ groupBy })}</span>
			{isFiltered && (
				<span className="shrink-0 text-tertiary-foreground">
					· {shownCount} of {groupValues.length}
				</span>
			)}
		</>
	);
};

export const GroupByCell = ({ propertyKeys }: { propertyKeys: string[] }) => {
	const { availableGroupValues } = useAnalyticsContext();
	const {
		groupBy,
		effectiveGroupBy,
		maxGroups,
		setMaxGroups,
		fieldOptions,
		updateGroupBy,
	} = useBreakdown();
	const [searchValue, setSearchValue] = useState("");

	const matchingKeys = propertyKeys.filter((key) =>
		key.toLowerCase().includes(searchValue.toLowerCase()),
	);

	return (
		<Popover>
			<PopoverTrigger asChild>
				<FilterTriggerButton
					label="Group by"
					value={
						effectiveGroupBy ? (
							<GroupByValue groupBy={effectiveGroupBy} />
						) : (
							"None"
						)
					}
				/>
			</PopoverTrigger>
			<PopoverContent align="start" className="flex flex-col w-[280px] p-1">
				<OptionRow isSelected={!groupBy} onSelect={() => updateGroupBy(null)}>
					None
				</OptionRow>
				{fieldOptions.map((option) => (
					<OptionRow
						key={option.groupBy}
						isSelected={groupBy === option.groupBy}
						hint={option.disabledReason}
						disabled={Boolean(option.disabledReason)}
						onSelect={() => updateGroupBy(option.groupBy)}
					>
						{groupByLabel({ groupBy: option.groupBy })}
					</OptionRow>
				))}

				{propertyKeys.length > 0 && (
					<>
						<Separator />
						<span className={overlayLabelClassName}>Event properties</span>
						{propertyKeys.length > PROPERTY_SEARCH_THRESHOLD && (
							<OverlaySearchInput
								placeholder="Search properties..."
								value={searchValue}
								onChange={(e) => setSearchValue(e.target.value)}
								className="-mx-1 mb-1"
							/>
						)}
						<div className="flex max-h-36 flex-col overflow-y-auto">
							{matchingKeys.map((key) => (
								<OptionRow
									key={key}
									isSelected={groupBy === key}
									onSelect={() => updateGroupBy(key)}
								>
									<span className="truncate font-mono text-xs">{key}</span>
								</OptionRow>
							))}
						</div>
					</>
				)}

				{groupBy && (
					<>
						<Separator />
						<div className="flex h-[34px] items-center justify-between px-2 text-sm text-muted-foreground">
							Max groups
							<MaxGroupsInput value={maxGroups} onChange={setMaxGroups} />
						</div>
					</>
				)}

				{effectiveGroupBy && availableGroupValues.length > 0 && (
					<>
						<Separator />
						<GroupValueChecklist groupBy={effectiveGroupBy} />
					</>
				)}
			</PopoverContent>
		</Popover>
	);
};
