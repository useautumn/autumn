/**
 * set_plans adopts attach's request guards (Q6).
 *
 * Red (before):  set_plans skipped them and executed the request.
 * Green (after): each request is rejected with attach's message.
 */

import { test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("set-plans guards: billing_behavior none rejected when removing a live trial")}`,
	async () => {
		const proTrial = products.proWithTrial({
			items: [items.monthlyMessages({ includedUsage: 100 })],
			trialDays: 14,
		});

		const { customerId, autumnV2_4 } = await initScenario({
			customerId: "set-plans-guard-proration",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proTrial] }),
			],
			actions: [s.billing.attach({ productId: proTrial.id })],
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage:
				"Cannot set proration_behavior to 'none' when removing a free trial",
			func: () =>
				autumnV2_4.billing.setPlans({
					customer_id: customerId,
					free_trial: null,
					billing_behavior: "none",
					phases: [{ starts_at: "now", plans: [{ plan_id: proTrial.id }] }],
				}),
		});
	},
);
