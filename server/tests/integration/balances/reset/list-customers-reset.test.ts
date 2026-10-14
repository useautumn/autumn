import { expect, test } from "bun:test";
import type { ApiCustomer } from "@autumn/shared";
import { findCustomerEntitlement } from "@tests/balances/utils/findCustomerEntitlement.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expireCusEntForReset } from "@tests/utils/cusProductUtils/resetTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const PREFIX = "reset-list-cohort";
const OTHER_IDS = Array.from({ length: 5 }, (_, i) => `${PREFIX}-${i + 2}`);

const STALE_IDS = [`${PREFIX}-2`, `${PREFIX}-4`, `${PREFIX}-6`];
const FRESH_IDS = [`${PREFIX}-1`, `${PREFIX}-3`, `${PREFIX}-5`];

const USAGE: Record<string, number> = {
	[`${PREFIX}-1`]: 20,
	[`${PREFIX}-2`]: 35,
	[`${PREFIX}-3`]: 50,
	[`${PREFIX}-4`]: 15,
	[`${PREFIX}-5`]: 70,
	[`${PREFIX}-6`]: 40,
};

test.concurrent(`${chalk.yellowBright("list customers reset: only stale customers are reset, fresh customers keep usage")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freePlan = products.base({
		id: "free",
		items: [messagesItem],
	});

	const primaryId = `${PREFIX}-1`;

	const { autumnV1, autumnV2, ctx } = await initScenario({
		customerId: primaryId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.otherCustomers(
				OTHER_IDS.map((id) => ({
					id,
					testClock: false,
				})),
			),
			s.products({ list: [freePlan] }),
		],
		actions: [
			s.attach({ productId: freePlan.id }),
			...OTHER_IDS.map((id) =>
				s.attach({ productId: freePlan.id, customerId: id }),
			),
		],
	});

	const allIds = [primaryId, ...OTHER_IDS];
	await Promise.all(
		allIds.map((id) =>
			autumnV1.track({
				customer_id: id,
				feature_id: TestFeature.Messages,
				value: USAGE[id],
			}),
		),
	);
	await new Promise((resolve) => setTimeout(resolve, 2000));

	await Promise.all(
		STALE_IDS.map((id) =>
			expireCusEntForReset({
				ctx,
				customerId: id,
				featureId: TestFeature.Messages,
			}),
		),
	);

	const listRes = (await autumnV2.customers.listV2({
		search: PREFIX,
	})) as { list: ApiCustomer[] };

	for (const id of allIds) {
		const found = listRes.list.find((c) => c.id === id);
		expect(found).toBeDefined();
	}

	await new Promise((resolve) => setTimeout(resolve, 5000));

	for (const id of STALE_IDS) {
		const customer = await autumnV2.customers.get<ApiCustomer>(id, {
			skip_cache: "true",
		});
		expect(customer.balances[TestFeature.Messages].current_balance).toBe(100);
		expect(customer.balances[TestFeature.Messages].usage).toBe(0);

		const cusEnt = await findCustomerEntitlement({
			ctx,
			customerId: id,
			featureId: TestFeature.Messages,
		});
		expect(cusEnt).toBeDefined();
		expect(cusEnt!.next_reset_at).toBeGreaterThan(Date.now());
	}

	for (const id of FRESH_IDS) {
		const customer = await autumnV2.customers.get<ApiCustomer>(id, {
			skip_cache: "true",
		});
		expect(customer.balances[TestFeature.Messages].current_balance).toBe(
			100 - USAGE[id],
		);
		expect(customer.balances[TestFeature.Messages].usage).toBe(USAGE[id]);
	}
});
