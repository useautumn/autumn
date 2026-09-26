import type { ApiEventsListItem } from "@autumn/shared";
import {
	ArrowUpRightIcon,
	CheckIcon,
	CopyIcon,
	XIcon,
} from "@phosphor-icons/react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { type CSSProperties, type ReactNode, useState } from "react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { useEnv } from "@/utils/envUtils";
import { getRedirectUrl } from "@/utils/genUtils";
import { useLogFeatures } from "../hooks/useLogFeatures";
import {
	formatPropertyFilter,
	useLogsFilters,
	withPropertyFilter,
} from "../hooks/useLogsFilters";
import { EventJsonDialog } from "./EventJsonDialog";

const COPIED_RESET_MS = 1_500;

// Inline so the layout never depends on arbitrary-value classes being generated.
const PANE_STYLE: CSSProperties = { width: 380 };
const KEY_COLUMN_STYLE: CSSProperties = { width: 96, flexShrink: 0 };

const ROW = "flex items-center h-8 px-5 gap-3 text-[13px]";
const KEY = "truncate text-subtle";
const ICON_BUTTON =
	"flex items-center justify-center size-7 rounded-md border text-subtle hover:bg-muted hover:text-foreground";
const SECTION_LABEL =
	"px-5 pt-2.5 pb-1.5 text-[11px] font-medium tracking-wider uppercase text-subtle";

/** filter_by matches the literal `"key":"value"` text, so only string values can match. */
const isFilterableValue = (value: unknown): value is string =>
	typeof value === "string";

const GridRow = ({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) => (
	<div className={ROW}>
		<span className={KEY} style={KEY_COLUMN_STYLE}>
			{label}
		</span>
		{children}
	</div>
);

const PropertyRow = ({
	propertyKey,
	value,
	isFiltering,
	onFilter,
}: {
	propertyKey: string;
	value: unknown;
	isFiltering: boolean;
	onFilter: () => void;
}) => {
	const displayValue = isFilterableValue(value) ? value : JSON.stringify(value);

	return (
		<div className={cn(ROW, "group font-mono text-xs hover:bg-muted/50")}>
			<span className={KEY} style={KEY_COLUMN_STYLE} title={propertyKey}>
				{propertyKey}
			</span>
			<span
				className="flex-1 min-w-0 truncate text-foreground"
				title={displayValue}
			>
				{displayValue}
			</span>
			{isFiltering ? (
				<span className="shrink-0 font-sans text-[11px] text-primary">
					Filtering
				</span>
			) : (
				isFilterableValue(value) && (
					<button
						type="button"
						onClick={onFilter}
						className="shrink-0 h-5 px-1.5 rounded border font-sans text-[11px] text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-foreground"
					>
						Filter
					</button>
				)
			)}
		</div>
	);
};

export const LogDetailPane = ({
	event,
	onClose,
}: {
	event: ApiEventsListItem;
	onClose: () => void;
}) => {
	const env = useEnv();
	const { colorFor, nameFor } = useLogFeatures();
	const { filters, setFilters } = useLogsFilters();
	const [isCopied, setIsCopied] = useState(false);
	const [isJsonOpen, setIsJsonOpen] = useState(false);

	const color = colorFor(event.feature_id);
	const occurredAt = new Date(event.timestamp);
	const propertyEntries = Object.entries(event.properties ?? {});

	const copyEvent = async () => {
		await navigator.clipboard.writeText(JSON.stringify(event, null, 2));
		setIsCopied(true);
		setTimeout(() => setIsCopied(false), COPIED_RESET_MS);
	};

	const filterByProperty = ({ key, value }: { key: string; value: string }) =>
		setFilters({
			properties: withPropertyFilter({
				properties: filters.properties,
				filter: { key, value },
			}),
		});

	return (
		<aside
			style={PANE_STYLE}
			className="flex flex-col shrink-0 min-h-0 overflow-y-auto border-l bg-card"
		>
			<div className="flex flex-col gap-3.5 px-5 pt-5 pb-4 border-b shrink-0">
				<div className="flex items-center justify-between gap-3">
					<span
						className="flex items-center gap-2 h-[22px] px-2 min-w-0 rounded-[5px] text-xs font-medium"
						style={{
							background: `color-mix(in srgb, ${color} 15%, transparent)`,
							color: `color-mix(in srgb, ${color} 55%, white)`,
						}}
					>
						<span
							className="size-[7px] shrink-0 rounded-[2px]"
							style={{ background: color }}
						/>
						<span className="truncate">{nameFor(event.feature_id)}</span>
					</span>
					<div className="flex gap-1 shrink-0">
						<button
							type="button"
							aria-label="Copy event JSON"
							title={isCopied ? "Copied" : "Copy JSON"}
							onClick={copyEvent}
							className={ICON_BUTTON}
						>
							{isCopied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
						</button>
						<button
							type="button"
							aria-label="Close event details"
							onClick={onClose}
							className={ICON_BUTTON}
						>
							<XIcon size={12} />
						</button>
					</div>
				</div>
				<div className="flex items-baseline gap-2">
					<span className="text-[32px] leading-9 font-semibold tracking-tight text-foreground tabular-nums">
						{event.value.toLocaleString()}
					</span>
					<span className="text-sm text-subtle">used</span>
				</div>
				<span className="text-xs text-subtle">
					{format(occurredAt, "MMM d, HH:mm:ss")} ·{" "}
					{formatDistanceToNowStrict(occurredAt, { addSuffix: true })}
				</span>
			</div>

			<div className="flex flex-col py-2 shrink-0">
				<GridRow label="Customer">
					<Link
						to={getRedirectUrl(`/customers/${event.customer_id}`, env)}
						title={event.customer_id}
						className="flex flex-1 items-center gap-2 min-w-0 font-mono text-xs text-foreground hover:underline"
					>
						<span className="truncate">{event.customer_id}</span>
						<ArrowUpRightIcon
							size={12}
							className="ml-auto shrink-0 text-subtle"
						/>
					</Link>
				</GridRow>
				{event.deductions?.map((deduction) => (
					<GridRow key={deduction.balance_id} label="Balance">
						<span className="flex-1 min-w-0 truncate text-foreground">
							{nameFor(deduction.feature_id)}
							<span className="pl-1.5 text-subtle tabular-nums">
								−{deduction.value.toLocaleString()}
							</span>
						</span>
					</GridRow>
				))}
				<GridRow label="Event ID">
					<span
						className="flex-1 min-w-0 truncate font-mono text-xs text-muted-foreground"
						title={event.id}
					>
						{event.id}
					</span>
				</GridRow>
			</div>

			<div className="mx-5 border-t shrink-0" />

			<div className="flex flex-col pt-2 pb-3 shrink-0">
				<span className={SECTION_LABEL}>Properties</span>
				{propertyEntries.length === 0 ? (
					<span className="px-5 py-2 text-[13px] text-subtle">
						No properties
					</span>
				) : (
					propertyEntries.map(([key, value]) => (
						<PropertyRow
							key={key}
							propertyKey={key}
							value={value}
							isFiltering={
								isFilterableValue(value) &&
								filters.properties.includes(
									formatPropertyFilter({ key, value }),
								)
							}
							onFilter={() => {
								if (isFilterableValue(value)) filterByProperty({ key, value });
							}}
						/>
					))
				)}
			</div>

			<div className="flex gap-2 px-5 pt-3.5 pb-5 mt-auto border-t shrink-0">
				<button
					type="button"
					onClick={() => setFilters({ customer_id: event.customer_id })}
					className="flex items-center h-7 px-2.5 rounded-md border bg-interactive-secondary text-xs text-muted-foreground hover:bg-interactive-secondary-hover hover:text-foreground"
				>
					View customer's logs
				</button>
				<button
					type="button"
					onClick={() => setIsJsonOpen(true)}
					className="flex items-center h-7 px-2.5 rounded-md border bg-interactive-secondary text-xs text-muted-foreground hover:bg-interactive-secondary-hover hover:text-foreground"
				>
					View JSON
				</button>
			</div>
			<EventJsonDialog
				event={event}
				isOpen={isJsonOpen}
				setIsOpen={setIsJsonOpen}
			/>
		</aside>
	);
};
