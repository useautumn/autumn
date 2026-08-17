import type { SubscriptionVerifyResult } from "@autumn/shared";
import { Badge } from "@autumn/ui";
import {
	CheckCircleIcon,
	type Icon,
	WarningCircleIcon,
	XCircleIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export type VerifyDisplayStatus = "in_sync" | "warning" | "mismatched";

const STATUS_CONFIG = {
	in_sync: {
		label: "In sync",
		icon: CheckCircleIcon,
		className: "bg-green-500/10 text-green-500 border-transparent",
	},
	warning: {
		label: "Warning",
		icon: WarningCircleIcon,
		className: "bg-amber-500/10 text-amber-500 border-transparent",
	},
	mismatched: {
		label: "Mismatched",
		icon: XCircleIcon,
		className: "bg-red-500/10 text-red-500 border-transparent",
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
		<Badge variant="muted" size="sm" className={cn("gap-1", config.className)}>
			<StatusIcon size={11} weight="fill" />
			{config.label}
		</Badge>
	);
}
