import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ─────────────────────────────────────────────────────────────────────────────
// ERR-1: lock on allocated feature → 400
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("check-with-lock-errors ERR-1: lock not supported for allocated feature")}`, async () => {
	const allocatedUsers = items.allocatedUsers({ includedUsage: 5 });
	const freeProd = products.base({
		id: "free",
		items: [allocatedUsers],
	});

	const customerId = "lock-error-allocated-1";

	const { autumnV2_1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, paymentMethod: "success" }),
			s.products({ list: [freeProd] }),
		],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await expectAutumnError({
		func: async () => {
			await autumnV2_1.check({
				customer_id: customerId,
				feature_id: TestFeature.Users,
				required_balance: 1,
				lock: { enabled: true, key: customerId },
			});
		},
	});
});
