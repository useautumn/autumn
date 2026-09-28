import type { SubscriptionVerifyResult } from "@autumn/shared";
import { StatusChip, type StatusGlyph, type StatusTone } from "@autumn/ui";

export type VerifyDisplayStatus = "in_sync" | "warning" | "mismatched";

const STATUS_CONFIG = {
	in_sync: { label: "In sync", tone: "green", glyph: "check" },
	warning: { label: "Warning", tone: "amber", glyph: "alert" },
	mismatched: { label: "Mismatched", tone: "red", glyph: "x" },
} satisfies Record<
	VerifyDisplayStatus,
	{ label: string; tone: StatusTone; glyph: StatusGlyph }
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
	const { label, tone, glyph } = STATUS_CONFIG[status];

	return (
		<StatusChip tone={tone} glyph={glyph}>
			{label}
		</StatusChip>
	);
}
