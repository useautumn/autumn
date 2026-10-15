import type { SetPlansPreviewWarning, SetPlansTextPart } from "@autumn/shared";
import { SetPlansTextLine } from "@/components/forms/shared/errors/SetPlansTextLine";
import { WarningBanner } from "@/components/forms/shared/WarningBanner";

/** Changes that remove or lose something, charge now, or move when billing starts get a banner; the review sections already show the rest. */
const BANNER_WARNING_TYPES = new Set<SetPlansPreviewWarning["type"]>([
	"subscription_replaced",
	"open_invoice_not_collected",
	"usage_not_billed",
	"unmanaged_stripe_item_removed",
	"future_phase_removed",
	"pending_quantity_change_dropped",
	"trial_ended",
	"interval_change_invoices_now",
	"past_due_invoice_open",
	"billing_starts_later",
	"subscription_recreated_backdated",
	"cycle_reset_rebills_plans",
	"cycle_reset_ignored",
]);

type BannerLine = {
	message: string;
	parts: SetPlansTextPart[];
	count: number;
};

/** Identical messages (e.g. one per entity) collapse into a single counted line. */
const toBannerLines = (warnings: SetPlansPreviewWarning[]): BannerLine[] => {
	const linesByMessage = new Map<string, BannerLine>();
	for (const { message, parts } of warnings) {
		const line = linesByMessage.get(message);
		linesByMessage.set(message, {
			message,
			parts: parts?.length ? parts : [{ text: message }],
			count: (line?.count ?? 0) + 1,
		});
	}
	return [...linesByMessage.values()];
};

export function ReviewWarnings({
	warnings,
}: {
	warnings: SetPlansPreviewWarning[];
}) {
	const bannerWarnings = warnings.filter((warning) =>
		BANNER_WARNING_TYPES.has(warning.type),
	);
	const isInfoOnly = bannerWarnings.every(
		(warning) => warning.severity === "info",
	);

	return (
		<WarningBanner
			lines={toBannerLines(bannerWarnings).map((line) => ({
				key: line.message,
				severity: isInfoOnly ? "info" : "warning",
				content: <BannerLineText line={line} />,
			}))}
		/>
	);
}

function BannerLineText({ line }: { line: BannerLine }) {
	return (
		<>
			<SetPlansTextLine parts={line.parts} />
			{line.count > 1 && (
				<span className="text-tertiary-foreground"> ×{line.count}</span>
			)}
		</>
	);
}
