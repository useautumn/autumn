import { CheckCircleIcon } from "@phosphor-icons/react";
import { useId } from "react";
import {
	TABLE_TRAY_CLASS,
	TABLE_TRAY_SURFACE_CLASS,
	TABLE_TRAY_SURFACE_DIVIDER_CLASS,
} from "@/components/general/table";
import { cn } from "@/lib/utils";
import { StripeStatusChip } from "@/views/customers2/components/sync-stripe-v2/StripeStatusBadge";
import type { SubscriptionPickerRow } from "./utils/buildSubscriptionPickerRows";
import {
	type SubscriptionRenewal,
	subscriptionRenewalLabel,
} from "./utils/subscriptionRenewal";

const PICKER_GRID_CLASS =
	"grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_6.5rem_8rem_1rem] items-center gap-3 px-3";

const EMPTY_CELL = "—";

const RENEWAL_TEXT_CLASSES: Record<SubscriptionRenewal["kind"], string> = {
	renews: "text-tertiary-foreground",
	starts: "text-tertiary-foreground",
	none: "text-tertiary-foreground",
	cancels: "text-amber-500",
	payment_failed: "text-red-500",
};

function SubscriptionRenewalCell({
	renewal,
}: {
	renewal: SubscriptionRenewal;
}) {
	return (
		<span
			className={cn(
				"truncate text-right text-xs tabular-nums",
				RENEWAL_TEXT_CLASSES[renewal.kind],
			)}
		>
			{subscriptionRenewalLabel({ renewal })}
		</span>
	);
}

function SubscriptionPickerRowOption({
	row,
	groupName,
	isSelected,
	onSelect,
}: {
	row: SubscriptionPickerRow;
	groupName: string;
	isSelected: boolean;
	onSelect: () => void;
}) {
	const planNames = row.planNames.join(", ");
	return (
		<label
			className={cn(
				PICKER_GRID_CLASS,
				TABLE_TRAY_SURFACE_DIVIDER_CLASS,
				"min-h-12 w-full cursor-pointer py-2 transition-colors has-[:focus-visible]:ring-1 has-[:focus-visible]:ring-primary has-[:focus-visible]:ring-inset",
				isSelected ? "bg-active-primary" : "hover:bg-table-row-hover",
			)}
		>
			<input
				type="radio"
				name={groupName}
				value={row.key}
				checked={isSelected}
				onChange={onSelect}
				aria-label={`${row.scopeName}, ${row.stripeObjectLabel}`}
				className="sr-only"
			/>
			<span className="flex min-w-0 flex-col gap-0.5">
				<span className="truncate text-sm text-foreground">
					{row.scopeName}
				</span>
				<code className="truncate font-mono text-xs text-tertiary-foreground">
					{row.stripeObjectLabel}
				</code>
			</span>
			<span
				className="truncate text-sm text-muted-foreground"
				title={planNames}
			>
				{planNames || EMPTY_CELL}
			</span>
			<span className="flex min-w-0">
				{row.status && <StripeStatusChip status={row.status} />}
			</span>
			<SubscriptionRenewalCell renewal={row.renewal} />
			<span className="flex justify-end">
				{isSelected && (
					<CheckCircleIcon
						weight="fill"
						aria-hidden
						className="size-4 text-primary"
					/>
				)}
			</span>
		</label>
	);
}

export function SubscriptionPickerTable({
	rows,
	selectedKey,
	onSelect,
}: {
	rows: SubscriptionPickerRow[];
	selectedKey: string | null;
	onSelect: (key: string) => void;
}) {
	const groupName = useId();
	return (
		<div className={TABLE_TRAY_CLASS}>
			<div
				aria-hidden
				className={cn(
					PICKER_GRID_CLASS,
					"h-7 text-xs text-tertiary-foreground",
				)}
			>
				<span>Subscription</span>
				<span>Plans</span>
				<span>Status</span>
				<span className="text-right">Renews</span>
				<span />
			</div>
			<fieldset className={cn(TABLE_TRAY_SURFACE_CLASS, "min-w-0")}>
				<legend className="sr-only">Stripe subscriptions</legend>
				{rows.map((row) => (
					<SubscriptionPickerRowOption
						key={row.key}
						row={row}
						groupName={groupName}
						isSelected={row.key === selectedKey}
						onSelect={() => onSelect(row.key)}
					/>
				))}
			</fieldset>
		</div>
	);
}
