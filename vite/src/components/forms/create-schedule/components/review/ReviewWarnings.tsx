import type { SetPlansPreviewWarning } from "@autumn/shared";
import { Alert, AlertDescription } from "@autumn/ui";
import { InfoIcon, WarningCircleIcon } from "@phosphor-icons/react";

/** Only changes that remove or lose something get a banner; the review sections already show the rest. */
const BANNER_WARNING_TYPES = new Set<SetPlansPreviewWarning["type"]>([
	"unmanaged_stripe_item_removed",
	"existing_schedule_replaced",
	"future_phase_removed",
	"pending_quantity_change_dropped",
]);

export function ReviewWarnings({
	warnings,
}: {
	warnings: SetPlansPreviewWarning[];
}) {
	const bannerWarnings = warnings.filter((warning) =>
		BANNER_WARNING_TYPES.has(warning.type),
	);
	if (bannerWarnings.length === 0) return null;

	return (
		<div className="flex flex-col gap-2 px-4 pt-4">
			{bannerWarnings.map((warning) => {
				const isInfo = warning.severity === "info";
				const Icon = isInfo ? InfoIcon : WarningCircleIcon;

				return (
					<Alert
						key={`${warning.type}-${warning.message}`}
						variant={isInfo ? "default" : "warning"}
					>
						<Icon weight="fill" />
						<AlertDescription>{warning.message}</AlertDescription>
					</Alert>
				);
			})}
		</div>
	);
}
