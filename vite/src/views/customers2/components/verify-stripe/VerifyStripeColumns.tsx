import type { SubscriptionMismatch } from "@autumn/shared";
import { WarningCircleIcon } from "@phosphor-icons/react";
import type { ColumnDef, Row } from "@tanstack/react-table";
import { cn } from "@/lib/utils";

const ISSUE_LABELS: Record<SubscriptionMismatch["type"], string> = {
	base_price_mismatch: "Base price",
	item_mismatch: "Item",
	prepaid_quantity_mismatch: "Prepaid quantity",
	prepaid_price_mismatch: "Prepaid price",
	schedule_mismatch: "Schedule",
	cancel_state_mismatch: "Cancellation",
	reward_mismatch: "Coupons",
	stripe_sub_not_in_autumn: "Unlinked",
	stale_subscription_link: "Stale link",
	expected_state_error: "Unknown state",
};

const NO_VALUE = "–";

/** Comparable expected/actual pair for the mismatch, when the type carries one. */
const mismatchToExpectedActual = (
	mismatch: SubscriptionMismatch,
): { expected: string; actual: string } => {
	switch (mismatch.type) {
		case "item_mismatch":
			return {
				expected: mismatch.expected_quantity?.toString() ?? NO_VALUE,
				actual: mismatch.actual_quantity?.toString() ?? NO_VALUE,
			};
		case "base_price_mismatch":
			return {
				expected:
					mismatch.expected_amount ??
					mismatch.expected_quantity?.toString() ??
					NO_VALUE,
				actual: mismatch.actual_amount ?? NO_VALUE,
			};
		case "prepaid_quantity_mismatch":
			return {
				expected: mismatch.expected_quantity.toString(),
				actual: mismatch.actual_quantity.toString(),
			};
		case "prepaid_price_mismatch":
			return {
				expected: mismatch.expected_unit_amount,
				actual: mismatch.actual_unit_amount,
			};
		case "schedule_mismatch":
			return {
				expected: mismatch.expected_phase_count?.toString() ?? NO_VALUE,
				actual: mismatch.actual_phase_count?.toString() ?? NO_VALUE,
			};
		case "cancel_state_mismatch":
			return {
				expected: mismatch.expected_canceling ? "Canceling" : "Active",
				actual: mismatch.actual_canceling ? "Canceling" : "Active",
			};
		default:
			return { expected: NO_VALUE, actual: NO_VALUE };
	}
};

export const createVerifyMismatchColumns = (): ColumnDef<
	SubscriptionMismatch,
	unknown
>[] => [
	{
		header: "Issue",
		id: "issue",
		size: 130,
		cell: ({ row }: { row: Row<SubscriptionMismatch> }) => {
			const mismatch = row.original;
			const isWarning = mismatch.severity === "warning";
			return (
				<span className="flex items-center gap-1.5 text-foreground">
					<WarningCircleIcon
						size={12}
						weight="fill"
						className={cn(
							"shrink-0",
							isWarning ? "text-amber-500" : "text-red-500",
						)}
					/>
					{ISSUE_LABELS[mismatch.type]}
				</span>
			);
		},
	},
	{
		header: "Details",
		id: "details",
		cell: ({ row }: { row: Row<SubscriptionMismatch> }) => (
			<span className="block whitespace-normal break-words text-tertiary-foreground py-2">
				{row.original.message}
			</span>
		),
	},
	{
		header: "Expected",
		id: "expected",
		size: 90,
		cell: ({ row }: { row: Row<SubscriptionMismatch> }) => (
			<span className="text-tertiary-foreground tabular-nums">
				{mismatchToExpectedActual(row.original).expected}
			</span>
		),
	},
	{
		header: "Actual",
		id: "actual",
		size: 90,
		cell: ({ row }: { row: Row<SubscriptionMismatch> }) => (
			<span className="text-tertiary-foreground tabular-nums">
				{mismatchToExpectedActual(row.original).actual}
			</span>
		),
	},
];
