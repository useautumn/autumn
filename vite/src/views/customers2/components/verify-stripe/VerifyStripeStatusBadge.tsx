import type { SubscriptionVerifyResult } from "@autumn/shared";
import { StatusChip, StatusChipIcon } from "@autumn/ui";
import {
	CheckIcon,
	ExclamationMarkIcon,
	type Icon,
	XIcon,
} from "@phosphor-icons/react";

export type VerifyDisplayStatus = "in_sync" | "warning" | "mismatched";

const STATUS_CONFIG = {
	in_sync: {
		label: "In sync",
		icon: CheckIcon,
		className: "bg-green-500",
	},
	warning: {
		label: "Warning",
		icon: ExclamationMarkIcon,
		className: "bg-amber-500",
	},
	mismatched: {
		label: "Mismatched",
		icon: XIcon,
		className: "bg-red-500",
	},
} satisfies Record<
	VerifyDisplayStatus,
	{ label: string; icon: Icon; className: string }
>;

export const resultToDisplayStatus = (
	result: SubscriptionVerifyResult,
): VerifyDisplayStatus => {
	if (result.status === "correct") return "in_sync";
	const hasError = result.mismatches.some(
		(mismatch) => mismatch.severity !== "warning",
	);
	return hasError ? "mismatched" : "warning";
};

export function VerifyStripeStatusBadge({
	status,
}: {
	status: VerifyDisplayStatus;
}) {
	const config = STATUS_CONFIG[status];
	const StatusIcon = config.icon;

	return (
		<StatusChip
			indicator={
				<StatusChipIcon
					icon={<StatusIcon weight="bold" />}
					className={config.className}
				/>
			}
		>
			{config.label}
		</StatusChip>
	);
}
