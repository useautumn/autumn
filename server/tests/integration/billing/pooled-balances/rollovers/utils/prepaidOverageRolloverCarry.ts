import { expect } from "bun:test";
import {
	type ApiCustomerV5,
	BillingMethod,
	ResetInterval,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { getPooledBalanceDbState } from "../../utils/getPooledBalanceDbState.js";

const BILLING_UNITS = 100;
const PREPAID_GRANT = 200;
const USAGE = 40;
const POOLED_GRANT = 10_000;
export const POOLED_GRANT_INCREASED = 20_000;

export const CARRIED = PREPAID_GRANT * 0.5;

const rolloverConfig = {
	max_percentage: 50,
	length: 1,
	duration: RolloverExpiryDurationType.Month,
};

export const pooledCreditsItem = ({ included }: { included: number }) => ({
	feature_id: TestFeature.Credits,
	included,
	pooled: true,
	reset: { interval: ResetInterval.Month },
	rollover: {
		max_percentage: 50,
		expiry_duration_type: RolloverExpiryDurationType.Month,
		expiry_duration_length: 1,
	},
});

export const customization = {
	remove_items: [
		{ feature_id: TestFeature.Credits, billing_method: BillingMethod.Prepaid },
		{
			feature_id: TestFeature.Credits,
			billing_method: BillingMethod.UsageBased,
		},
	],
	add_items: [pooledCreditsItem({ included: POOLED_GRANT })],
};

export const setupPrepaidOverageCredits = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const prepaidCredits = items.prepaid({
		featureId: TestFeature.Credits,
		billingUnits: BILLING_UNITS,
		price: 10,
		includedUsage: 0,
	});
	const creditsPro = products.pro({
		id: `${customerId}-pro`,
		items: [
			{
				...prepaidCredits,
				config: { ...prepaidCredits.config, rollover: rolloverConfig },
			},
			items.consumable({
				featureId: TestFeature.Credits,
				includedUsage: 0,
				price: 0.1,
				billingUnits: 1,
			}),
		],
	});

	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [creditsPro] }),
		],
		actions: [
			s.billing.attach({
				productId: creditsPro.id,
				options: [{ feature_id: TestFeature.Credits, quantity: PREPAID_GRANT }],
			}),
			s.track({ featureId: TestFeature.Credits, value: USAGE, timeout: 2000 }),
			s.advanceToNextInvoice(),
		],
	});

	const customerAfterReset =
		await scenario.autumnV2_3.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});
	expect(customerAfterReset.balances?.[TestFeature.Credits]?.remaining).toBe(
		PREPAID_GRANT + CARRIED,
	);

	const beforeMove = await getPooledBalanceDbState({
		db: scenario.ctx.db,
		customerId,
	});
	expect(beforeMove.pools).toHaveLength(0);

	return { ...scenario, customerId, plan: creditsPro };
};

export const expectRolloverCarriedToPool = async ({
	scenario,
}: {
	scenario: Awaited<ReturnType<typeof setupPrepaidOverageCredits>>;
}) => {
	const { ctx, customerId, autumnV2_3 } = scenario;

	const afterMove = await getPooledBalanceDbState({ db: ctx.db, customerId });
	expect(afterMove.pools).toHaveLength(1);
	expect(afterMove.pools[0].granted).toBe(POOLED_GRANT);

	const pooledCustomerEntitlement = afterMove.poolCustomerEntitlements[0];
	const pooledRollovers = pooledCustomerEntitlement.rollovers ?? [];
	expect(pooledRollovers).toHaveLength(1);

	expect(pooledRollovers[0].balance).toBe(CARRIED);

	const customerAfterMove = await autumnV2_3.customers.get<ApiCustomerV5>(
		customerId,
		{ skip_cache: "true" },
	);
	expect(customerAfterMove.balances?.[TestFeature.Credits]?.remaining).toBe(
		POOLED_GRANT + CARRIED,
	);
};
