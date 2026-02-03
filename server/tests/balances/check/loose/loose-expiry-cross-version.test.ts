import { expect, test } from "bun:test";
import type {
	ApiBalance,
	ApiBalanceBreakdown,
	ApiCusFeatureV3Breakdown,
	ApiCustomer,
	ApiCustomerV3,
} from "@shared/index";
import { TestFeature } from "@tests/setup/v2Features";
import { initScenario } from "@tests/utils/testInitUtils/initScenario";

test.concurrent("loose-expiry-cross-version", async () => {
	const customerId = "loose-expiry-cross-version";
	const { autumnV2, autumnV1 } = await initScenario({
		customerId,
		setup: [],
		actions: [],
	});

	await autumnV1.balances.create({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		granted_balance: 100,
		expires_at: Date.now() + 1000,
	});

	const V1Cust = (await autumnV1.customers.get(
		customerId,
	)) as unknown as ApiCustomerV3;
	const V2Cust = (await autumnV2.customers.get(
		customerId,
	)) as unknown as ApiCustomer;

	const V1Bal = V1Cust.features[TestFeature.Messages] ?? null;
	const V1Breakdown = V1Bal?.breakdown?.find(
		(x: ApiCusFeatureV3Breakdown) =>
			x.expires_at !== null && x.expires_at !== undefined,
	);

	expect(V1Bal).toBeDefined();
	expect(V1Breakdown).toBeDefined();
	expect(V1Breakdown?.expires_at).toBeDefined();
	expect(V1Breakdown?.expires_at).toBeGreaterThan(Date.now());

	const V2Bal = (V2Cust.balances[TestFeature.Messages] ??
		null) as unknown as ApiBalance;
	const V2Breakdown = V2Bal?.breakdown?.find(
		(x: ApiBalanceBreakdown) =>
			x.expires_at !== null && x.expires_at !== undefined,
	);

	expect(V2Bal).toBeDefined();
	expect(V2Breakdown).toBeDefined();
	expect(V2Breakdown?.expires_at).toBeDefined();
	expect(V2Breakdown?.expires_at).toBeGreaterThan(Date.now());

	expect(V1Breakdown?.expires_at).toBe(V2Breakdown?.expires_at);
});
