import type { SetPlansPreviewWarning } from "@autumn/shared";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";

const INFO_WARNING_TYPES: SetPlansPreviewWarning["type"][] = [
	"new_stripe_price_created",
	"proration_disabled",
];

export function ReviewWarnings({
	warnings,
}: {
	warnings: SetPlansPreviewWarning[];
}) {
	if (warnings.length === 0) return null;

	return (
		<div className="flex flex-col gap-2">
			{warnings.map((warning) => (
				<InfoBox
					key={`${warning.type}-${warning.message}`}
					variant={
						INFO_WARNING_TYPES.includes(warning.type) ? "info" : "warning"
					}
				>
					{warning.message}
				</InfoBox>
			))}
		</div>
	);
}
