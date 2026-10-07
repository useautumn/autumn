/**
 * invoices.create — license feature_quantities are priced by the license plan,
 * never by the parent plan's customize.items.
 *
 * Red (before):  the parent's customize.items override repriced the license's
 *                feature line, and could mint a price the license plan lacks.
 * Green (after): license feature lines use the license plan's prices only.
 */

import { expect, test } from "bun:test";
import { BillingInterval, BillingMethod, ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	createInvoice,
	expectCreatedInvoiceCorrect,
} from "./utils/expectCreatedInvoiceCorrect";

const parentMessagesOverride = {
	feature_id: TestFeature.Messages,
	price: {
		amount: 1,
		interval: BillingInterval.Month,
		billing_method: BillingMethod.UsageBased,
		billing_units: 1,
	},
};

const tenMessages = {
	feature_id: TestFeature.Messages,
	billing_behavior: BillingMethod.UsageBased,
	quantity: 10,
};

test.concurrent(
	`${chalk.yellowBright("invoices.create: a parent customize.items override does not reprice the license's same feature")}`,
	async () => {
		const customerId = "inv-create-lic-feat-override";
		const parent = products.pro({
			id: "pro-create-lic-feat-override",
			items: [items.consumableMessages({ price: 0.1 })],
		});
		const seat = products.base({
			id: "seat-create-lic-feat-override",
			items: [
				items.monthlyPrice({ price: 15 }),
				items.consumableMessages({ price: 0.2 }),
			],
		});
		const { ctx, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [parent, seat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: seat.id,
					included: 0,
				}),
			],
		});

		const response = await createInvoice({
			autumnV2_3,
			params: {
				customer_id: customerId,
				plans: [
					{
						plan_id: parent.id,
						customize: { price: null, items: [parentMessagesOverride] },
						feature_quantities: [tenMessages],
						license_quantities: [
							{
								license_plan_id: seat.id,
								quantity: 0,
								feature_quantities: [tenMessages],
							},
						],
					},
				],
			},
		});

		// Parent: 10 × $1 (customized). License: 10 × $0.20 (license catalog).
		await expectCreatedInvoiceCorrect({
			ctx,
			response,
			lines: [
				{ amount: 10, quantity: 10, prorated: false },
				{ amount: 2, quantity: 10, prorated: false },
			],
			total: 12,
		});
		expect(response.preview.lines[1].plan_id).toBe(seat.id);
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.create: a license feature the license plan does not price is refused despite a parent override")}`,
	async () => {
		const customerId = "inv-create-lic-feat-unpriced";
		const parent = products.pro({
			id: "pro-create-lic-feat-unpriced",
			items: [],
		});
		const seat = products.base({
			id: "seat-create-lic-feat-unpriced",
			items: [items.monthlyPrice({ price: 15 })],
		});
		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [parent, seat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: seat.id,
					included: 0,
				}),
			],
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: `Feature ${TestFeature.Messages} has no price on this plan`,
			func: () =>
				createInvoice({
					autumnV2_3,
					params: {
						customer_id: customerId,
						plans: [
							{
								plan_id: parent.id,
								customize: { price: null, items: [parentMessagesOverride] },
								license_quantities: [
									{
										license_plan_id: seat.id,
										quantity: 1,
										feature_quantities: [tenMessages],
									},
								],
							},
						],
						preview: true,
					},
				}),
		});
	},
);
