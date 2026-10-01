import { Skeleton } from "@autumn/ui";
import { useId } from "react";
import {
	TABLE_TRAY_CLASS,
	TABLE_TRAY_SURFACE_CLASS,
} from "@/components/general/table";
import { cn } from "@/lib/utils";
import { StripeStatusChip } from "@/views/customers2/components/sync-stripe-v2/StripeStatusBadge";
import type {
	SubscriptionPickerRow,
	SubscriptionPickerStripeDetails,
} from "./utils/buildSubscriptionPickerRows";
import {
	type SubscriptionRenewal,
	subscriptionRenewalLabel,
} from "./utils/subscriptionRenewal";

const PICKER_GRID_CLASS =
	"grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_6rem_7rem] items-center gap-3";

const SELECTED_ROW_CLASS =
	"bg-white shadow-[0_0_0_1px_#e5e5e5,0_1px_3px_rgb(0_0_0/0.08)] dark:bg-[#262626] dark:shadow-[0_0_0_1px_#343434,0_1px_3px_rgb(0_0_0/0.5)]";

const EMPTY_CELL = "—";

const RENEWAL_TEXT_CLASSES: Record<SubscriptionRenewal["kind"], string> = {
	renews: "text-tertiary-foreground",
	starts: "text-tertiary-foreground",
	none: "text-tertiary-foreground",
	cancels: "text-amber-500",
	payment_failed: "text-red-500",
};

function SubscriptionStatusCell({
	stripe,
	isLoadingStripe,
}: {
	stripe: SubscriptionPickerStripeDetails | null;
	isLoadingStripe: boolean;
}) {
	if (!stripe) {
		return isLoadingStripe ? (
			<Skeleton className="h-5 w-16 rounded-md" />
		) : (
			<span className="text-xs text-tertiary-foreground">{EMPTY_CELL}</span>
		);
	}
	return (
		<span className="flex min-w-0">
			{stripe.status && <StripeStatusChip status={stripe.status} />}
		</span>
	);
}

function SubscriptionRenewalCell({
	stripe,
	isLoadingStripe,
}: {
	stripe: SubscriptionPickerStripeDetails | null;
	isLoadingStripe: boolean;
}) {
	if (!stripe) {
		return isLoadingStripe ? (
			<span className="flex flex-col items-end gap-1">
				<Skeleton className="h-3.5 w-20 rounded-sm" />
				<Skeleton className="h-3 w-12 rounded-sm" />
			</span>
		) : (
			<span className="text-right text-xs text-tertiary-foreground">
				{EMPTY_CELL}
			</span>
		);
	}
	return (
		<span className="flex min-w-0 flex-col items-end gap-0.5">
			<span
				className={cn(
					"truncate text-xs tabular-nums",
					RENEWAL_TEXT_CLASSES[stripe.renewal.kind],
				)}
			>
				{subscriptionRenewalLabel({ renewal: stripe.renewal })}
			</span>
			{stripe.cadence && (
				<span className="text-xs text-tertiary-foreground">
					{stripe.cadence}
				</span>
			)}
		</span>
	);
}

function SubscriptionPickerRowOption({
	row,
	groupName,
	isLoadingStripe,
	isSelected,
	onSelect,
}: {
	row: SubscriptionPickerRow;
	groupName: string;
	isLoadingStripe: boolean;
	isSelected: boolean;
	onSelect: () => void;
}) {
	const planNames = row.planNames.join(", ");
	return (
		<label
			className={cn(
				PICKER_GRID_CLASS,
				"min-h-[52px] w-full cursor-pointer rounded-md px-3 py-2 transition-[background-color,box-shadow] has-[:focus-visible]:outline has-[:focus-visible]:outline-1 has-[:focus-visible]:outline-primary",
				isSelected ? SELECTED_ROW_CLASS : "hover:bg-table-row-hover",
			)}
		>
			<input
				type="radio"
				name={groupName}
				value={row.key}
				checked={isSelected}
				onChange={onSelect}
				aria-label={`${row.scopeName}, ${row.stripeObjectId}`}
				className="sr-only"
			/>
			<span className="flex min-w-0 flex-col gap-0.5">
				<span className="truncate text-sm text-foreground">
					{row.scopeName}
				</span>
				<code className="truncate font-mono text-xs text-tertiary-foreground">
					{row.stripeObjectId}
				</code>
			</span>
			<span
				className="line-clamp-2 text-sm text-muted-foreground"
				title={planNames}
			>
				{planNames || EMPTY_CELL}
			</span>
			<SubscriptionStatusCell
				stripe={row.stripe}
				isLoadingStripe={isLoadingStripe}
			/>
			<SubscriptionRenewalCell
				stripe={row.stripe}
				isLoadingStripe={isLoadingStripe}
			/>
		</label>
	);
}

export function SubscriptionPickerTable({
	rows,
	isLoadingStripe,
	selectedKey,
	onSelect,
}: {
	rows: SubscriptionPickerRow[];
	isLoadingStripe: boolean;
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
					"h-7 px-[17px] text-xs text-tertiary-foreground",
				)}
			>
				<span>Subscription</span>
				<span>Plans</span>
				<span>Status</span>
				<span className="text-right">Renews</span>
			</div>
			<fieldset
				className={cn(
					TABLE_TRAY_SURFACE_CLASS,
					"flex min-w-0 flex-col gap-0.5 p-1",
				)}
			>
				<legend className="sr-only">Stripe subscriptions</legend>
				{rows.map((row) => (
					<SubscriptionPickerRowOption
						key={row.key}
						row={row}
						groupName={groupName}
						isLoadingStripe={isLoadingStripe}
						isSelected={row.key === selectedKey}
						onSelect={() => onSelect(row.key)}
					/>
				))}
			</fieldset>
		</div>
	);
}
