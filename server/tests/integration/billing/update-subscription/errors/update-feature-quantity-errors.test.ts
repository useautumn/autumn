import { test } from "bun:test";
import type { UpdateSubscriptionV1ParamsInput } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("error: negative quantity for prepaid feature")}`,
	async () => {
		const prepaidMessagesItem = items.prepaidMessages({
			includedUsage: 0,
			price: 10,
			billingUnits: 100,
		});
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({
			items: [priceItem, prepaidMessagesItem],
			id: "pro-neg",
		});

		const { customerId, autumnV2_4 } = await initScenario({
			customerId: "err-negative-qty",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.attach({
					productId: "pro-neg",
					options: [{ feature_id: TestFeature.Messages, quantity: 5 }],
				}),
			],
		});

		await expectAutumnError({
			func: () =>
				autumnV2_4.billing.update<UpdateSubscriptionV1ParamsInput>({
					customer_id: customerId,
					plan_id: pro.id,
					feature_quantities: [
						{ feature_id: TestFeature.Messages, quantity: -1 },
					],
				}),
		});
	},
);
