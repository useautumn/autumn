/** Leaves a Pro customer at -20 with Premium available for a manual carry-over attach.
 * Attach Premium with carry_over_balances enabled; the resulting balance should be 480. */

import { test } from "bun:test";
import { findCustomerEntitlement } from "@tests/balances/utils/findCustomerEntitlement";
import { waitForPostgresBalance } from "@tests/integration/cron/batch-reset-v2/batchResetV2TestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test(`${chalk.yellowBright("scenario: negative balance ready for carry-over attach")}`, async () => {
	const customerId = "carry-over-negative-balance-repro";
	const pro = products.pro({
		id: "pro",
		items: [items.consumableMessages({ includedUsage: 100 })],
	});
	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id, timeout: 4000 })],
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 120,
	});

	const cusEnt = await findCustomerEntitlement({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	if (!cusEnt) throw new Error("Messages balance not found");
	await waitForPostgresBalance({
		db: ctx.db,
		customerEntitlementId: cusEnt.id,
		expectedBalance: -20,
	});

	console.log(
		chalk.cyanBright(
			`\nCustomer ${customerId} is ready.\n` +
				`Current plan: ${pro.id}; messages balance: -20.\n` +
				`Attach ${premium.id} with carry over balances enabled; expect 480.\n`,
		),
	);
});
