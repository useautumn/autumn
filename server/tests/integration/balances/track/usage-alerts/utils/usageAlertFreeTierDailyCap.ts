import { ApiVersion, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

export const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

export const DAILY_CAP = 200;
export const ALERT_THRESHOLDS = [80, 100, 200] as const;

export const freePlan = (id: string) =>
	products.base({
		id,
		items: [items.monthlyMessages({ includedUsage: 10000 })],
		billingControls: {
			usage_limits: [
				{
					feature_id: TestFeature.Messages,
					limit: DAILY_CAP,
					interval: ResetInterval.Day,
					anchor: "utc",
				},
			],
			usage_alerts: ALERT_THRESHOLDS.map((threshold) => ({
				feature_id: TestFeature.Messages,
				basis: "usage_limit",
				threshold_type: "usage",
				threshold,
				enabled: true,
			})),
		},
	});

export const uncappedPlan = (id: string) =>
	products.base({
		id,
		items: [items.monthlyMessages({ includedUsage: 10000 })],
	});

export const track = (customerId: string, value: number) =>
	autumnV2_3.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value,
	});

export const canSendOneMore = async (customerId: string) => {
	const check = await autumnV2_3.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 1,
	});
	return check.allowed;
};
