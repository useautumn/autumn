import type { EventProperties } from "../../../models/cusModels/billingControls/usageLimit.js";
import { usageLimitFilterMatchesProperties } from "../../../models/cusModels/billingControls/usageLimit.js";
import type { CreditDimension } from "../../../models/featureModels/featureConfig/creditConfig.js";

export type { EventProperties };

export const matchesEventProperties = ({
	match,
	eventProperties,
}: {
	match: CreditDimension["match"];
	eventProperties: EventProperties;
}): boolean =>
	usageLimitFilterMatchesProperties({
		filterProperties: match,
		eventProperties: eventProperties ?? {},
	});
