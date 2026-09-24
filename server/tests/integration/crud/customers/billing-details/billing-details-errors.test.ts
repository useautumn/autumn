/**
 * billing_details needs a Stripe customer and valid Stripe input.
 *
 * Contract:
 *   update without a Stripe customer    -> 400, nothing written
 *   expand without a Stripe customer    -> billing_details: null
 *   invalid tax id with a removal       -> 400 (Stripe error), removal not applied
 */

import { test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { expectBillingDetailsCorrect } from "./utils/expectBillingDetailsCorrect.js";

test.concurrent(
	`${chalk.yellowBright("billing details: customer without Stripe")}`,
	async () => {
		const customerId = "billing-details-no-stripe";
		const { autumnV2_3 } = await initScenario({
			setup: [s.deleteCustomer({ customerId })],
			actions: [],
		});
		await autumnV2_3.customers.create({ id: customerId, name: "No Stripe" });

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: "Stripe customer",
			func: () =>
				autumnV2_3.customers.update(customerId, {
					billing_details: { tax_exempt: "exempt" },
				}),
		});

		await expectBillingDetailsCorrect({
			autumn: autumnV2_3,
			customerId,
			expected: null,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("billing details: invalid tax id keeps existing ones")}`,
	async () => {
		const { customerId, autumnV2_3 } = await initScenario({
			customerId: "billing-details-invalid-tax-id",
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		const germanVat = { type: "eu_vat", value: "DE123456789" };
		await autumnV2_3.customers.update(customerId, {
			billing_details: { tax_ids: { add: [germanVat] } },
		});

		await expectAutumnError({
			errCode: ErrCode.StripeError,
			func: () =>
				autumnV2_3.customers.update(customerId, {
					billing_details: {
						tax_ids: {
							add: [{ type: "eu_vat", value: "not-a-vat" }],
							remove: [germanVat],
						},
					},
				}),
		});

		await expectBillingDetailsCorrect({
			autumn: autumnV2_3,
			customerId,
			expected: { tax_ids: [germanVat] },
		});
	},
);
