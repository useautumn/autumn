import type { SetPlansPreviewWarning } from "@autumn/shared";
import { Alert, AlertDescription } from "@autumn/ui";
import { InfoIcon, WarningCircleIcon } from "@phosphor-icons/react";

/** Only changes that remove or lose something get a banner; the review sections already show the rest. */
const BANNER_WARNING_TYPES = new Set<SetPlansPreviewWarning["type"]>([
	"subscription_replaced",
	"open_invoice_not_collected",
	"discount_not_carried",
	"usage_not_billed",
	"unmanaged_stripe_item_removed",
	"existing_schedule_replaced",
	"future_phase_removed",
	"pending_quantity_change_dropped",
]);

type BannerLine = { message: string; count: number };

/** Identical messages (e.g. one per entity) collapse into a single counted line. */
const toBannerLines = (warnings: SetPlansPreviewWarning[]): BannerLine[] => {
	const countByMessage = new Map<string, number>();
	for (const { message } of warnings) {
		countByMessage.set(message, (countByMessage.get(message) ?? 0) + 1);
	}
	return [...countByMessage].map(([message, count]) => ({ message, count }));
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
			<Alert variant={isInfoOnly ? "default" : "warning"}>
				<Icon weight="fill" />
				<AlertDescription>
					{lines.length === 1 ? (
						<BannerLineText line={lines[0]} />
					) : (
						<ul className="flex list-disc flex-col gap-1 pl-4">
							{lines.map((line) => (
								<li key={line.message}>
									<BannerLineText line={line} />
								</li>
							))}
						</ul>
					)}
				</AlertDescription>
			</Alert>
		</div>
	);
}

function BannerLineText({ line }: { line: BannerLine }) {
	return (
		<>
			{line.message}
			{line.count > 1 && (
				<span className="text-tertiary-foreground"> ×{line.count}</span>
			)}
		</>
	);
}
