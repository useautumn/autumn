import type { SetPlansPreviewWarning, SetPlansTextPart } from "@autumn/shared";
import { Alert, StatusChipIcon } from "@autumn/ui";
import { SetPlansTextLine } from "@/components/forms/shared/errors/SetPlansTextLine";

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
	if (bannerWarnings.length === 0) return null;

	const isInfoOnly = bannerWarnings.every(
		(warning) => warning.severity === "info",
	);
	const lines = toBannerLines(bannerWarnings);

	return (
		<div className="px-4 pt-4">
			<Alert
				variant={isInfoOnly ? "default" : "warning"}
				className="gap-0.5 p-1.5"
			>
				{lines.map((line) => (
					<div
						key={line.message}
						className="flex items-center gap-2.5 px-2 py-1.5"
					>
						<StatusChipIcon
							tone={isInfoOnly ? "neutral" : "amber"}
							glyph="alert"
						/>
						<span>
							<BannerLineText line={line} />
						</span>
					</div>
				))}
			</Alert>
		</div>
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
