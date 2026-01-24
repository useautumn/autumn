import { test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-ENABLE PLAN ERROR TESTS
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("errors: auto_enable_plan_id with non-existent product")}`, async () => {
	const customerId = "error-auto-enable-nonexistent";

	const { autumnV1 } = await initScenario({
		setup: [
			s.deleteCustomer({ customerId }),
		],
		actions: [],
	});

	await expectAutumnError({
		errCode: ErrCode.ProductNotFound,
		func: async () => {
			await autumnV1.customers.create({
				id: customerId,
				auto_enable_plan_id: "non-existent-product-id",
			});
		},
	});
});
