import {
	ApiVersion,
	type CustomerBillingControls,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { setCustomerUsageLimit } from "../../../utils/usage-limit-utils/customerUsageLimitUtils.js";

export const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });
export const numericFilterValue = (value: number) => value as unknown as string;

const messagesPlan = (id: string) =>
	products.base({
		id,
		items: [items.monthlyMessages({ includedUsage: 10000 })],
	});

export const setupCustomer = async ({
	customerId,
	planId,
	plan = messagesPlan(planId),
	withEntity = false,
}: {
	customerId: string;
	planId: string;
	plan?: ReturnType<typeof products.base>;
	withEntity?: boolean;
}) => {
	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [plan] }),
			...(withEntity
				? [s.entities({ count: 1, featureId: TestFeature.Users })]
				: []),
		],
		actions: [s.billing.attach({ productId: plan.id })],
	});
	return scenario.entities?.[0];
};

export const setDailyLimit = (customerId: string, limit = 200) =>
	setCustomerUsageLimit({
		autumn: autumnV2_3,
		customerId,
		featureId: TestFeature.Messages,
		limit,
		interval: ResetInterval.Day,
		anchor: "utc",
	});

export const setUsageLimits = async ({
	customerId,
	usageLimits,
}: {
	customerId: string;
	usageLimits: NonNullable<CustomerBillingControls["usage_limits"]>;
}) => {
	await timeout(2000);
	await autumnV2_3.customers.update(customerId, {
		billing_controls: { usage_limits: usageLimits },
	});
	await timeout(3000);
};

export const usageLimitAlert = ({
	threshold = 80,
	thresholdType = "usage_percentage",
	filter,
}: {
	threshold?: number;
	thresholdType?:
		| "usage"
		| "usage_percentage"
		| "remaining"
		| "remaining_percentage";
	filter?: { properties: Record<string, string> };
} = {}) => ({
	feature_id: TestFeature.Messages,
	threshold,
	threshold_type: thresholdType,
	basis: "usage_limit" as const,
	enabled: true,
	...(filter && { filter }),
});

export const track = ({
	customerId,
	value,
	properties,
	entityId,
}: {
	customerId: string;
	value: number;
	properties?: Record<string, unknown>;
	entityId?: string;
}) =>
	autumnV2_3.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value,
		...(entityId && { entity_id: entityId }),
		...(properties && { properties }),
	});
