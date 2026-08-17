/** Leaves a Premium customer with -20 carried debt ready for dashboard recalculation.
 * Recalculation should absorb the debt and reduce displayed remaining from 500 to 480. */

import { test } from "bun:test";
import { findCustomerEntitlement } from "@tests/balances/utils/findCustomerEntitlement";
import { waitForPostgresBalance } from "@tests/integration/cron/batch-reset-v2/batchResetV2TestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test(`${chalk.yellowBright("scenario: negative carry-over ready for recalculation")}`, async () => {
	const customerId = "carry-over-negative-balance-repro";
	const pro = products.pro({
		id: "pro",
		items: [items.consumableMessages({ includedUsage: 100 })],
	});
	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { autumnV2, autumnV2_1, autumnV2_2, ctx } = await initScenario({
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
	await autumnV2_2.billing.attach({
		customer_id: customerId,
		plan_id: premium.id,
		carry_over_balances: { enabled: true },
	});
	const preview = await autumnV2.balances.previewRecalculate({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	console.log(
		chalk.cyanBright(
			`\nCustomer ${customerId} is ready.\n` +
				`Current plan: ${premium.id}; carried debt: -20.\n` +
				`Recalculate messages in the dashboard; remaining should become 480.\n`,
		),
		preview,
	);
});
