/**
 * TDD test for backdated starts_at when a future schedule already exists.
 *
 * Contract under test:
 *   New behaviors:
 *     - A customer with an existing future Stripe subscription schedule cannot replace it with a past starts_at
 *     - This keeps backdating scoped to fresh Stripe subscription creation instead of rewriting scheduled subscription history
 */

import { test } from "bun:test";
import { type AttachParamsV1Input, ErrCode, ms } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("starts_at backdate: replacing a future schedule is rejected")}`,
	async () => {
		const customerId = "attach-starts-at-backdate-scheduled-replace";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 200 })],
		});

		const { autumnV2_2, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [],
		});

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			starts_at: advancedTo + ms.days(30),
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage:
				"Past starts_at is only supported when creating a new Stripe subscription",
			func: () =>
				autumnV2_2.billing.attach<AttachParamsV1Input>({
					customer_id: customerId,
					plan_id: premium.id,
					starts_at: advancedTo - ms.days(10),
				}),
		});
	},
);
