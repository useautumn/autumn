import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

export const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

export const usageLimitAlert = ({
	threshold,
	thresholdType = "usage_percentage",
	filter,
}: {
	threshold: number;
	thresholdType?: "usage" | "usage_percentage" | "remaining";
	filter?: { properties: Record<string, string> };
}) => ({
	feature_id: TestFeature.Messages,
	basis: "usage_limit" as const,
	threshold,
	threshold_type: thresholdType,
	enabled: true,
	...(filter && { filter }),
});

export const track = ({
	customerId,
	value,
	entityId,
}: {
	customerId: string;
	value: number;
	entityId?: string;
}) =>
	autumnV2_3.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value,
		...(entityId && { entity_id: entityId }),
	});
