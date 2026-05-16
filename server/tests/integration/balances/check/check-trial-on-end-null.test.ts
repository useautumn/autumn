/**
 * Regression test: /balances.check should not throw a Zod validation error
 * when a customer has a free trial with on_end: NULL in the database.
 *
 * Previously, FreeTrialSchema used .optional() for on_end which rejects null
 * values from the DB. Changed to .nullish() to accept both null and undefined.
 */

import { expect, test } from "bun:test";
import { type CheckResponseV3 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("check-trial-on-end-null: /check works with trial that has null on_end")}`,
	async () => {
		const messagesItem = items.monthlyMessages({ includedUsage: 500 });
		const proTrial = products.proWithTrial({
			id: "pro-trial",
			items: [messagesItem],
			trialDays: 7,
			cardRequired: true,
		});

		const { customerId, autumnV1 } = await initScenario({
			customerId: "check-trial-null-on-end",
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [proTrial] }),
			],
			actions: [s.billing.attach({ productId: proTrial.id })],
		});

		const res = (await autumnV1.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV3;

		expect(res.allowed).toBe(true);
	},
);
