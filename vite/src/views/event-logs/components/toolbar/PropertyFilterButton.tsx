import {
	IconButton,
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@autumn/ui";
import { overlayLabelClassName } from "@autumn/ui/lib/overlay-classes";
import { FunnelSimpleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { OverlaySearchInput } from "@/views/customers/customer/analytics/components/OverlaySearchInput";
import {
	MAX_PROPERTY_FILTERS,
	parsePropertyFilter,
	useLogsFilters,
	withPropertyFilter,
} from "../../hooks/useLogsFilters";

/** Adds a `key=value` property filter on Enter; Backspace on an empty draft drops the last one. */
export const PropertyFilterButton = () => {
	const { filters, setFilters } = useLogsFilters();
	const [draft, setDraft] = useState("");
	const isFull = filters.properties.length >= MAX_PROPERTY_FILTERS;

	const addDraft = () => {
		const filter = parsePropertyFilter({ raw: draft });
		if (!filter) return;
		setFilters({
			properties: withPropertyFilter({
				properties: filters.properties,
				filter,
			}),
		});
		setDraft("");
	};

	const removeLastFilter = () =>
		setFilters({ properties: filters.properties.slice(0, -1) });

	return (
		<Popover>
			<PopoverTrigger asChild>
				<IconButton
					variant="secondary"
					className="btn-secondary-popup"
					icon={
						<FunnelSimpleIcon size={14} className="text-tertiary-foreground" />
					}
				>
					Filter
				</IconButton>
			</PopoverTrigger>
			<PopoverContent align="start" className="flex w-72 flex-col p-1">
				<OverlaySearchInput
					icon={<FunnelSimpleIcon className="size-3.5 shrink-0" />}
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") addDraft();
						if (e.key === "Backspace" && !draft && filters.properties.length) {
							removeLastFilter();
						}
					}}
					disabled={isFull}
					placeholder={isFull ? "Filter limit reached" : "model=sonnet-5"}
					aria-label="Add property filter"
					autoFocus
					className="-mx-1 -mt-1 font-mono"
				/>
				<span className={overlayLabelClassName}>
					{isFull
						? `Up to ${MAX_PROPERTY_FILTERS} property filters`
						: "Type key=value and press Enter"}
				</span>
			</PopoverContent>
		</Popover>
	);
};
