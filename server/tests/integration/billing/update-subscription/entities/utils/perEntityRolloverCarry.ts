import { expect } from "bun:test";
import {
	type ApiEntityV0,
	BillingInterval,
	BillingMethod,
	ResetInterval,
	RolloverExpiryDurationType,
	TierBehavior,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import {
	constructArrearItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem";
import { entityRolloverBalances } from "../entityRolloverBalances";

export const PREPAID_ROLLOVER_MAX = 40;
export const OVERAGE_ROLLOVER_MAX = 30;

// After the cycle reset, each bucket rolls over up to its own max per entity.
export const expectedRollovers = [OVERAGE_ROLLOVER_MAX, PREPAID_ROLLOVER_MAX];

export const buildItems = () => ({
	prepaidVolumeMessages: constructPrepaidItem({
		featureId: TestFeature.Messages,
		tiers: [
			{ to: 500, amount: 10 },
			{ to: "inf" as unknown as number, amount: 5 },
		],
		tierBehaviour: TierBehavior.VolumeBased,
		billingUnits: 100,
		includedUsage: 100,
		entityFeatureId: TestFeature.Users,
		rolloverConfig: {
			max: PREPAID_ROLLOVER_MAX,
			length: 1,
			duration: RolloverExpiryDurationType.Month,
		},
	}),
	overageMessages: constructArrearItem({
		featureId: TestFeature.Messages,
		includedUsage: 50,
		price: 0.1,
		billingUnits: 1,
		entityFeatureId: TestFeature.Users,
		rolloverConfig: {
			max: OVERAGE_ROLLOVER_MAX,
			length: 1,
			duration: RolloverExpiryDurationType.Month,
		},
	}),
	priceItem: items.monthlyPrice({ price: 30 }),
});

// Same items expressed in the public plan-item param shape, for
// customize.items (PUT) and add_items (PATCH) calls.
export const buildApiItems = () => ({
	prepaidVolume: {
		feature_id: TestFeature.Messages,
		included: 100,
		entity_feature_id: TestFeature.Users,
		reset: { interval: ResetInterval.Month },
		price: {
			tiers: [
				{ to: 500, amount: 10 },
				{ to: "inf" as const, amount: 5 },
			],
			tier_behavior: TierBehavior.VolumeBased,
			interval: BillingInterval.Month,
			billing_method: BillingMethod.Prepaid,
			billing_units: 100,
		},
		rollover: {
			max: PREPAID_ROLLOVER_MAX,
			expiry_duration_type: RolloverExpiryDurationType.Month,
			expiry_duration_length: 1,
		},
	},
	overage: {
		feature_id: TestFeature.Messages,
		included: 50,
		entity_feature_id: TestFeature.Users,
		reset: { interval: ResetInterval.Month },
		price: {
			amount: 0.1,
			interval: BillingInterval.Month,
			billing_method: BillingMethod.UsageBased,
			billing_units: 1,
		},
		rollover: {
			max: OVERAGE_ROLLOVER_MAX,
			expiry_duration_type: RolloverExpiryDurationType.Month,
			expiry_duration_length: 1,
		},
	},
});

export const setupPrepaidOverageEntities = async ({
	customerId,
	extraProducts = [],
}: {
	customerId: string;
	extraProducts?: ReturnType<typeof products.base>[];
}) => {
	const builtItems = buildItems();

	const pro = products.base({
		id: "pro",
		items: [
			builtItems.prepaidVolumeMessages,
			builtItems.overageMessages,
			builtItems.priceItem,
		],
	});

	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, ...extraProducts] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
			}),
			s.advanceToNextInvoice(),
		],
	});

	for (const entity of scenario.entities) {
		const entityBefore = await scenario.autumnV1.entities.get<ApiEntityV0>(
			scenario.customerId,
			entity.id,
		);
		expect(
			entityRolloverBalances(entityBefore),
			`pre-update rollovers wrong for ${entity.id} — test setup issue, not the bug`,
		).toEqual(expectedRollovers);
	}

	return { ...scenario, pro, ...builtItems };
};
