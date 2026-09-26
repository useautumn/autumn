import type { CustomerWithProducts } from "@autumn/shared";
import { SearchableSelect } from "@autumn/ui";
import {
	CaretDownIcon,
	MagnifyingGlassIcon,
	XIcon,
} from "@phosphor-icons/react";
import { type ComponentProps, type ReactNode, useState } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";
import { useCusSearchQueryV2 } from "@/views/customers/hooks/useCusSearchQuery";
import { useLogFeatures } from "../hooks/useLogFeatures";
import {
	LOG_RANGE_LABELS,
	LOG_RANGES,
	type LogRange,
	MAX_PROPERTY_FILTERS,
	parsePropertyFilter,
	useLogsFilters,
	withPropertyFilter,
} from "../hooks/useLogsFilters";

const ALL = "__all__";
const CUSTOMER_SEARCH_PAGE_SIZE = 25;

type Option = { id: string; name: string; secondary?: string | null };

const TOOLBAR_CONTROL =
	"flex items-center gap-1.5 h-8 px-2.5 shrink-0 rounded-md border bg-input-background text-[13px] text-foreground hover:bg-interactive-secondary-hover";

/** Spreads props so the picker's PopoverTrigger (asChild) can attach its handlers. */
const TriggerButton = ({
	label,
	isActive,
	className,
	...props
}: ComponentProps<"button"> & {
	label: ReactNode;
	isActive: boolean;
}) => (
	<button
		type="button"
		{...props}
		className={cn(
			TOOLBAR_CONTROL,
			!isActive && "text-muted-foreground",
			className,
		)}
	>
		<span className="max-w-[180px] truncate">{label}</span>
		<CaretDownIcon size={10} weight="bold" className="text-subtle" />
	</button>
);

const EventFilter = () => {
	const { filters, setFilters } = useLogsFilters();
	const { features, nameFor } = useLogFeatures();
	const options: Option[] = [
		{ id: ALL, name: "All events" },
		...features.map((f) => ({ id: f.id, name: f.name, secondary: f.id })),
	];

	return (
		<SearchableSelect<Option>
			value={filters.feature_id ?? ALL}
			onValueChange={(value) =>
				setFilters({ feature_id: value === ALL ? null : value })
			}
			options={options}
			getOptionValue={(o) => o.id}
			getOptionLabel={(o) => o.name}
			searchable
			searchPlaceholder="Search events..."
			emptyText="No events found"
			contentClassName="min-w-[240px]"
			trigger={
				<TriggerButton
					label={
						filters.feature_id ? nameFor(filters.feature_id) : "All events"
					}
					isActive={Boolean(filters.feature_id)}
				/>
			}
		/>
	);
};

const toCustomerOption = ({
	customer,
}: {
	customer: Pick<CustomerWithProducts, "id" | "internal_id" | "name" | "email">;
}): Option => {
	const id = customer.id || customer.internal_id;
	return { id, name: customer.name || customer.email || id, secondary: id };
};

const CustomerFilter = () => {
	const { filters, setFilters } = useLogsFilters();
	const [search, setSearch] = useState("");
	const debouncedSearch = useDebounce({ value: search, delayMs: 300 });
	const { customers, isFetchingUncached } = useCusSearchQueryV2({
		search: debouncedSearch,
		page_size: CUSTOMER_SEARCH_PAGE_SIZE,
	});

	const selectedId = filters.customer_id;
	const searched = ((customers ?? []) as CustomerWithProducts[])
		.map((customer) => toCustomerOption({ customer }))
		.filter((option) => option.id !== selectedId);
	const options: Option[] = [
		{ id: ALL, name: "All customers" },
		...(selectedId ? [{ id: selectedId, name: selectedId }] : []),
		...searched,
	];

	return (
		<SearchableSelect<Option>
			value={selectedId ?? ALL}
			onValueChange={(value) =>
				setFilters({ customer_id: value === ALL ? null : value })
			}
			options={options}
			getOptionValue={(o) => o.id}
			getOptionLabel={(o) => o.name}
			searchable
			shouldFilter={false}
			onSearchChange={setSearch}
			isLoading={isFetchingUncached}
			searchPlaceholder="Search by name, email or ID..."
			emptyText="No customers found"
			contentClassName="min-w-[280px]"
			trigger={
				<TriggerButton
					label={selectedId ?? "All customers"}
					isActive={Boolean(selectedId)}
				/>
			}
		/>
	);
};

/** Active filters as chips; a new `key=value` is added on Enter, not per keystroke. */
const PropertyFilters = () => {
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

	const removeFilter = (raw: string) =>
		setFilters({
			properties: filters.properties.filter((existing) => existing !== raw),
		});

	return (
		<div className={cn(TOOLBAR_CONTROL, "flex-1 min-w-0 gap-2 cursor-text")}>
			<MagnifyingGlassIcon size={13} className="shrink-0 text-subtle" />
			{filters.properties.map((raw) => (
				<span
					key={raw}
					className="flex items-center gap-1 h-5 pl-1.5 pr-1 shrink-0 rounded bg-primary/15 font-mono text-xs text-primary"
				>
					{raw}
					<button
						type="button"
						aria-label={`Remove ${raw}`}
						onClick={() => removeFilter(raw)}
						className="opacity-70 hover:opacity-100"
					>
						<XIcon size={10} />
					</button>
				</span>
			))}
			<input
				value={draft}
				onChange={(e) => setDraft(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter") addDraft();
					if (e.key === "Backspace" && !draft && filters.properties.length) {
						removeFilter(filters.properties[filters.properties.length - 1]);
					}
				}}
				disabled={isFull}
				placeholder={
					isFull
						? `Up to ${MAX_PROPERTY_FILTERS} property filters`
						: "Filter by property, e.g. model=sonnet-5"
				}
				aria-label="Add property filter"
				className="flex-1 min-w-[120px] bg-transparent font-mono text-xs outline-none placeholder:text-subtle disabled:cursor-not-allowed"
			/>
		</div>
	);
};

const RangeFilter = () => {
	const { filters, setFilters } = useLogsFilters();
	const options: Option[] = LOG_RANGES.map((range) => ({
		id: range,
		name: LOG_RANGE_LABELS[range],
	}));

	return (
		<SearchableSelect<Option>
			value={filters.range}
			onValueChange={(value) => setFilters({ range: value as LogRange })}
			options={options}
			getOptionValue={(o) => o.id}
			getOptionLabel={(o) => o.name}
			trigger={
				<TriggerButton label={LOG_RANGE_LABELS[filters.range]} isActive />
			}
		/>
	);
};

const LiveToggle = () => {
	const { filters, setFilters } = useLogsFilters();
	return (
		<button
			type="button"
			aria-pressed={filters.live}
			onClick={() => setFilters({ live: !filters.live })}
			className={cn(TOOLBAR_CONTROL, !filters.live && "text-muted-foreground")}
		>
			<span
				className={cn(
					"size-1.5 rounded-full",
					filters.live ? "bg-emerald-500 animate-pulse" : "bg-subtle",
				)}
			/>
			Live
		</button>
	);
};

export const LogsToolbar = () => (
	<div className="flex items-center gap-2 h-[52px] px-4 shrink-0 border-b">
		<EventFilter />
		<CustomerFilter />
		<PropertyFilters />
		<RangeFilter />
		<LiveToggle />
	</div>
);
