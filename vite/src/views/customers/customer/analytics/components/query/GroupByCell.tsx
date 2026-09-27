import { Popover, PopoverContent, PopoverTrigger } from "@autumn/ui";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { Check } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAnalyticsContext } from "../../AnalyticsContext";
import { groupByLabel } from "../../utils/displayLabels";
import { GroupValueChecklist } from "./GroupValueChecklist";
import { MaxGroupsInput } from "./MaxGroupsInput";
import { StripCell } from "./StripCell";
import { useBreakdown } from "./useBreakdown";
import { useGroupVisibility } from "./useGroupVisibility";

const PROPERTY_SEARCH_THRESHOLD = 5;

const PanelLabel = ({ children }: { children: string }) => (
	<span className="px-2 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-subtle">
		{children}
	</span>
);

const Divider = () => <span className="h-px my-1 bg-border" />;

const GroupOption = ({
	label,
	isSelected,
	disabledReason,
	isMonospace = false,
	onSelect,
}: {
	label: string;
	isSelected: boolean;
	disabledReason?: string;
	isMonospace?: boolean;
	onSelect: () => void;
}) => (
	<button
		type="button"
		disabled={Boolean(disabledReason)}
		onClick={onSelect}
		className={cn(
			"flex items-center justify-between gap-2 h-[30px] px-2 rounded-[5px] text-left text-[13px] text-muted-foreground hover:bg-muted disabled:opacity-50 disabled:hover:bg-transparent",
			isSelected && "bg-muted text-foreground",
		)}
	>
		<span className={cn("truncate", isMonospace && "font-mono text-xs")}>
			{label}
		</span>
		{disabledReason && (
			<span className="shrink-0 text-[11px] text-subtle">{disabledReason}</span>
		)}
		{isSelected && <Check className="h-3 w-3 shrink-0 text-primary" />}
	</button>
);

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

export const GroupByCell = ({
	propertyKeys,
	className,
}: {
	propertyKeys: string[];
	className?: string;
}) => {
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
				<StripCell
					label="Group by"
					className={className}
					isPlaceholder={!effectiveGroupBy}
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
				<PanelLabel>Group by</PanelLabel>
				<GroupOption
					label="Nothing"
					isSelected={!groupBy}
					onSelect={() => updateGroupBy(null)}
				/>
				{fieldOptions.map((option) => (
					<GroupOption
						key={option.groupBy}
						label={groupByLabel({ groupBy: option.groupBy })}
						isSelected={groupBy === option.groupBy}
						disabledReason={option.disabledReason}
						onSelect={() => updateGroupBy(option.groupBy)}
					/>
				))}

				{propertyKeys.length > 0 && (
					<>
						<Divider />
						<PanelLabel>Event properties</PanelLabel>
						{propertyKeys.length > PROPERTY_SEARCH_THRESHOLD && (
							<div className="flex items-center gap-2 h-7 mx-1.5 mb-1 px-2 rounded-md border bg-background">
								<MagnifyingGlassIcon
									size={12}
									className="text-subtle shrink-0"
								/>
								<input
									type="text"
									placeholder="Search properties..."
									value={searchValue}
									onChange={(e) => setSearchValue(e.target.value)}
									className="flex-1 min-w-0 bg-transparent text-xs outline-none placeholder:text-subtle"
								/>
							</div>
						)}
						<div className="flex flex-col max-h-36 overflow-y-auto">
							{matchingKeys.map((key) => (
								<GroupOption
									key={key}
									label={key}
									isMonospace
									isSelected={groupBy === key}
									onSelect={() => updateGroupBy(key)}
								/>
							))}
						</div>
					</>
				)}

				{groupBy && (
					<>
						<Divider />
						<div className="flex items-center justify-between h-[34px] px-2 text-[13px] text-muted-foreground">
							Max groups
							<MaxGroupsInput value={maxGroups} onChange={setMaxGroups} />
						</div>
					</>
				)}

				{effectiveGroupBy && availableGroupValues.length > 0 && (
					<>
						<Divider />
						<GroupValueChecklist groupBy={effectiveGroupBy} />
					</>
				)}
			</PopoverContent>
		</Popover>
	);
};
