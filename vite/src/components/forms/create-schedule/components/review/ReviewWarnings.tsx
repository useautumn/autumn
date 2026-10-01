import type { SetPlansPreviewWarning, SetPlansTextPart } from "@autumn/shared";
import { Alert, AlertDescription, cn } from "@autumn/ui";
import { InfoIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { SetPlansTextLine } from "@/components/forms/shared/errors/SetPlansTextLine";

/** Changes that remove or lose something, or charge now, get a banner; the review sections already show the rest. */
const BANNER_WARNING_TYPES = new Set<SetPlansPreviewWarning["type"]>([
	"subscription_replaced",
	"open_invoice_not_collected",
	"discount_not_carried",
	"usage_not_billed",
	"unmanaged_stripe_item_removed",
	"existing_schedule_replaced",
	"future_phase_removed",
	"pending_quantity_change_dropped",
	"trial_ended",
	"interval_change_invoices_now",
	"past_due_invoice_open",
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
			parts: parts ?? [{ text: message }],
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
	const Icon = isInfoOnly ? InfoIcon : WarningCircleIcon;
	const lines = toBannerLines(bannerWarnings);

	return (
		<div className="px-4 pt-4">
			<Alert variant={isInfoOnly ? "default" : "warning"} className="py-1">
				<Icon weight="fill" className="mt-1.5" />
				<AlertDescription
					className={cn(
						"flex flex-col divide-y *:py-1.5",
						isInfoOnly ? "divide-zinc-500/10" : "divide-amber-500/10",
					)}
				>
					{lines.map((line) => (
						<div key={line.message}>
							<BannerLineText line={line} />
						</div>
					))}
				</AlertDescription>
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
