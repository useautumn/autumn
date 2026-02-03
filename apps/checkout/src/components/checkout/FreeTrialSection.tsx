import type { ApiFreeTrialV2 } from "@autumn/shared";
import { formatTrialDuration } from "@/utils/trialUtils";

interface FreeTrialSectionProps {
	freeTrial: ApiFreeTrialV2;
	trialAvailable: boolean;
}

export function FreeTrialSection({ freeTrial, trialAvailable }: FreeTrialSectionProps) {
	const duration = formatTrialDuration({
		duration_type: freeTrial.duration_type,
		duration_length: freeTrial.duration_length,
	});

	return (
		<div className="flex items-center justify-between gap-4 px-3 py-2.5">
			<span className="text-sm text-muted-foreground">
				Free Trial
			</span>
			<span className="text-sm text-muted-foreground shrink-0">
				{duration}
			</span>
		</div>
	);
}
