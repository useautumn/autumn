import { test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

const autumnV2_1 = new AutumnInt({ version: ApiVersion.V2_1 });
const { db, org, env } = ctx;

const customerId = "temp-test";

test.concurrent(`${chalk.yellowBright("temp: rest update then rpc inverse update returns product to baseline")}`, async () => {
	const consumableMessagesItem = items.consumableMessages({
		includedUsage: 100,
	});
	const proProduct = products.base({
		id: "pro",
		items: [consumableMessagesItem, items.annualPrice({ price: 200 })],
	});

	const { autumnV1, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proProduct] }),
		],
		actions: [],
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: proProduct.id,
	});

	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfWeeks: 6,
	});
});
