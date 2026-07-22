import { expect } from "bun:test";
import {
	type ApiCustomerV5,
	CusProductStatus,
	EntInterval,
	PooledBalanceResetMode,
	ResetInterval,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { expectPooledBalanceCorrect } from "./expectPooledBalanceCorrect.js";
import { getPooledSourceCustomerProduct } from "./getPooledBalanceDbState.js";

export const INITIAL_POOLED_GRANT = 100;
export const UPDATED_POOLED_GRANT = 200;
const PREPAID_GRANT = 100;
const USAGE = 50;
const ROLLOVER_GRANT = 50;
const PRODUCT_GROUP = "pooled-rollover-transition";

const rolloverConfig = {
	max_percentage: 50,
	length: 1,
	duration: RolloverExpiryDurationType.Month,
} as const;

export const updatedPooledPlanItem = {
	feature_id: TestFeature.Messages,
	included: UPDATED_POOLED_GRANT,
	pooled: true,
	reset: { interval: ResetInterval.Month },
	rollover: {
		max_percentage: 50,
		expiry_duration_type: RolloverExpiryDurationType.Month,
		expiry_duration_length: 1,
	},
};

export const setupPooledRolloverTransitionScenario = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const prepaidAddon = products.oneOffAddOn({
		id: `${customerId}-prepaid-addon`,
		items: [items.oneOffMessages({ includedUsage: PREPAID_GRANT })],
	});
	const pro = products.pro({
		id: `${customerId}-pro`,
		group: PRODUCT_GROUP,
		items: [
			{
				...items.monthlyMessagesWithRollover({
					includedUsage: INITIAL_POOLED_GRANT,
					rolloverConfig,
				}),
				pooled: true,
			},
		],
	});
	const enterprise = products.base({
		id: `${customerId}-enterprise`,
		group: PRODUCT_GROUP,
		items: [
			{
				...items.monthlyMessagesWithRollover({
					includedUsage: UPDATED_POOLED_GRANT,
					rolloverConfig,
				}),
				pooled: true,
			},
			items.monthlyPrice({ price: 50 }),
		],
	});

	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
			s.products({ list: [prepaidAddon, pro, enterprise] }),
		],
		actions: [
			s.billing.attach({ productId: prepaidAddon.id }),
			s.billing.attach({ productId: pro.id, entityIndex: 0 }),
			s.track({
				featureId: TestFeature.Messages,
				value: USAGE,
				entityIndex: 1,
				timeout: 2_000,
			}),
			s.advanceToNextInvoice(),
		],
	});

	const state = await expectPooledBalanceCorrect({
		db: scenario.ctx.db,
		customerId,
		pool: {
			balance: INITIAL_POOLED_GRANT,
			adjustment: 0,
			granted: INITIAL_POOLED_GRANT,
			interval: EntInterval.Month,
			nextResetAt: "present",
			resetCycleAnchor: "present",
			resetMode: PooledBalanceResetMode.Subscription,
			stripeSubscriptionId: "stripe_subscription",
			rollovers: [{ balance: ROLLOVER_GRANT, usage: 0 }],
		},
		contributions: {
			count: 1,
			currentContribution: INITIAL_POOLED_GRANT,
			nextCycleContribution: INITIAL_POOLED_GRANT,
		},
		sources: { count: 1, balance: 0, adjustment: 0 },
	});
	const sourceCustomerProduct = getPooledSourceCustomerProduct({
		state,
		productId: pro.id,
		entityId: scenario.entities[0].id,
	});
	const prepaidCustomerProduct = state.sourceCustomerProducts.find(
		(customerProduct) => customerProduct.product_id === prepaidAddon.id,
	);
	const prepaidCustomerEntitlement =
		prepaidCustomerProduct?.customer_entitlements.find(
			(customerEntitlement) =>
				customerEntitlement.feature_id === TestFeature.Messages,
		);
	const rollover = state.poolCustomerEntitlements[0]?.rollovers[0];

	expect(prepaidCustomerProduct).toBeDefined();
	expect(prepaidCustomerEntitlement?.balance).toBe(PREPAID_GRANT);
	expect(rollover?.balance).toBe(ROLLOVER_GRANT);

	return {
		...scenario,
		enterprise,
		prepaidCustomerEntitlementId: prepaidCustomerEntitlement?.id,
		prepaidCustomerProductId: prepaidCustomerProduct?.id,
		pro,
		rolloverId: rollover?.id,
		sourceCustomerProduct,
	};
};

export const expectPooledRolloverTransitionCorrect = async ({
	scenario,
	expectedProductId,
}: {
	scenario: Awaited<ReturnType<typeof setupPooledRolloverTransitionScenario>>;
	expectedProductId: string;
}) => {
	const state = await expectPooledBalanceCorrect({
		db: scenario.ctx.db,
		customerId: scenario.customerId,
		pool: {
			balance: UPDATED_POOLED_GRANT,
			adjustment: 0,
			granted: UPDATED_POOLED_GRANT,
			interval: EntInterval.Month,
			nextResetAt: "present",
			resetCycleAnchor: "present",
			resetMode: PooledBalanceResetMode.Subscription,
			stripeSubscriptionId: "stripe_subscription",
			rollovers: [{ balance: ROLLOVER_GRANT, usage: 0 }],
		},
		contributions: {
			count: 1,
			currentContribution: UPDATED_POOLED_GRANT,
			nextCycleContribution: UPDATED_POOLED_GRANT,
			excludedSourceCustomerProductIds: [scenario.sourceCustomerProduct.id],
		},
		sources: { count: 2, balance: 0, adjustment: 0 },
	});

	expect(state.poolCustomerEntitlements[0]?.rollovers[0]?.id).toBe(
		scenario.rolloverId,
	);
	const prepaidCustomerProduct = state.sourceCustomerProducts.find(
		(customerProduct) =>
			customerProduct.id === scenario.prepaidCustomerProductId,
	);
	const prepaidCustomerEntitlement =
		prepaidCustomerProduct?.customer_entitlements.find(
			(customerEntitlement) =>
				customerEntitlement.id === scenario.prepaidCustomerEntitlementId,
		);
	expect(prepaidCustomerProduct?.status).toBe(CusProductStatus.Active);
	expect(prepaidCustomerEntitlement?.balance).toBe(PREPAID_GRANT);
	expect(
		state.sourceCustomerProducts.some(
			(customerProduct) =>
				customerProduct.product_id === expectedProductId &&
				customerProduct.status === CusProductStatus.Active,
		),
	).toBe(true);

	const customer = await scenario.autumnV2_2.customers.get<ApiCustomerV5>(
		scenario.customerId,
		{ skip_cache: "true" },
	);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: UPDATED_POOLED_GRANT + ROLLOVER_GRANT + PREPAID_GRANT,
		usage: 0,
		rollovers: [{ balance: ROLLOVER_GRANT }],
	});
};
