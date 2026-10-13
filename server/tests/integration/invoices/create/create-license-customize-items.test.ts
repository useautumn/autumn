/**
 * invoices.create — license_quantities[].customize.items prices a license's
 * feature_quantities for this invoice only, the license-side counterpart of
 * the plan's customize.items.
 *
 * Red (before):  customize.items on a license entry is rejected by the schema.
 * Green (after): license items override, mint and name Stripe prices for the
 *                license's own feature lines; parent items never reach them.
 */

import { expect, test } from "bun:test";
import {
	BillingInterval,
	BillingMethod,
	type CreateInvoiceParamsInput,
	type InvoiceCustomizeItem,
	type ProductItem,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	createInvoice,
	expectCreatedInvoiceCorrect,
} from "./utils/expectCreatedInvoiceCorrect";

const usageItem = ({
	featureId,
	amount,
}: {
	featureId: string;
	amount: number;
}): InvoiceCustomizeItem => ({
	feature_id: featureId,
	price: {
		amount,
		interval: BillingInterval.Month,
		billing_method: BillingMethod.UsageBased,
		billing_units: 1,
	},
});

const tenOf = (featureId: string) => ({
	feature_id: featureId,
	billing_behavior: BillingMethod.UsageBased,
	quantity: 10,
});

/** A parent plan linked to one license plan, invoiced with no seat or base charge. */
const setupLinkedLicense = async ({
	customerId,
	parentItems,
	licenseItems,
}: {
	customerId: string;
	parentItems: ProductItem[];
	licenseItems: ProductItem[];
}) => {
	const parent = products.pro({ id: `pro-${customerId}`, items: parentItems });
	const seat = products.base({
		id: `seat-${customerId}`,
		items: [items.monthlyPrice({ price: 15 }), ...licenseItems],
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
	return { ctx, autumnV2_3, parent, seat };
};

const invoiceParams = ({
	customerId,
	parentId,
	seatId,
	parentCustomizeItems,
	parentQuantities,
	license,
}: {
	customerId: string;
	parentId: string;
	seatId: string;
	parentCustomizeItems?: InvoiceCustomizeItem[];
	parentQuantities?: ReturnType<typeof tenOf>[];
	license: {
		customizeItems: InvoiceCustomizeItem[];
		quantities: NonNullable<
			NonNullable<
				NonNullable<
					CreateInvoiceParamsInput["plans"]
				>[number]["license_quantities"]
			>[number]["feature_quantities"]
		>;
	};
}): CreateInvoiceParamsInput => ({
	customer_id: customerId,
	plans: [
		{
			plan_id: parentId,
			customize: { price: null, items: parentCustomizeItems },
			feature_quantities: parentQuantities,
			license_quantities: [
				{
					license_plan_id: seatId,
					quantity: 0,
					customize: { items: license.customizeItems },
					feature_quantities: license.quantities,
				},
			],
		},
	],
});

test.concurrent(
	`${chalk.yellowBright("invoices.create: a license item overrides the license plan's price for its own feature")}`,
	async () => {
		const customerId = "inv-lic-items-override";
		const { ctx, autumnV2_3, parent, seat } = await setupLinkedLicense({
			customerId,
			parentItems: [items.consumableMessages({ price: 0.1 })],
			licenseItems: [items.consumableMessages({ price: 0.2 })],
		});

		const response = await createInvoice({
			autumnV2_3,
			params: invoiceParams({
				customerId,
				parentId: parent.id,
				seatId: seat.id,
				parentCustomizeItems: [
					usageItem({ featureId: TestFeature.Messages, amount: 1 }),
				],
				parentQuantities: [tenOf(TestFeature.Messages)],
				license: {
					customizeItems: [
						usageItem({ featureId: TestFeature.Messages, amount: 0.5 }),
					],
					quantities: [tenOf(TestFeature.Messages)],
				},
			}),
		});

		// Parent: 10 × $1 (parent item). License: 10 × $0.50 (license item).
		await expectCreatedInvoiceCorrect({
			ctx,
			response,
			lines: [
				{ amount: 10, quantity: 10, prorated: false },
				{ amount: 5, quantity: 10, prorated: false },
			],
			total: 15,
		});
		expect(response.preview.lines[1].plan_id).toBe(seat.id);
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.create: a license item prices a feature the license plan lacks; parent items still stay out")}`,
	async () => {
		const customerId = "inv-lic-items-mint";
		const { ctx, autumnV2_3, parent, seat } = await setupLinkedLicense({
			customerId,
			parentItems: [],
			licenseItems: [items.consumableWords()],
		});

		const response = await createInvoice({
			autumnV2_3,
			params: invoiceParams({
				customerId,
				parentId: parent.id,
				seatId: seat.id,
				parentCustomizeItems: [
					usageItem({ featureId: TestFeature.Words, amount: 1 }),
				],
				license: {
					customizeItems: [
						usageItem({ featureId: TestFeature.Messages, amount: 0.5 }),
					],
					quantities: [tenOf(TestFeature.Messages), tenOf(TestFeature.Words)],
				},
			}),
		});

		// Messages: minted from the license item, 10 × $0.50. Words: the license
		// plan's $0.05, not the parent's $1 item.
		await expectCreatedInvoiceCorrect({
			ctx,
			response,
			lines: [
				{ amount: 5, quantity: 10, prorated: false },
				{ amount: 0.5, quantity: 10, prorated: false },
			],
			total: 5.5,
		});
		expect(response.preview.lines.map((line) => line.plan_id)).toEqual([
			seat.id,
			seat.id,
		]);
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.create: a license item naming a Stripe price bills through that price")}`,
	async () => {
		const customerId = "inv-lic-items-stripe";
		const { ctx, autumnV2_3, parent, seat } = await setupLinkedLicense({
			customerId,
			parentItems: [],
			licenseItems: [items.prepaidUsers()],
		});

		// $9 per pack of 2 users in Stripe; the request's inline $7 is ignored.
		const stripeProduct = await ctx.stripeCli.products.create({
			name: "License seat pack",
		});
		const stripePrice = await ctx.stripeCli.prices.create({
			product: stripeProduct.id,
			currency: "usd",
			unit_amount: 900,
		});

		const response = await createInvoice({
			autumnV2_3,
			params: invoiceParams({
				customerId,
				parentId: parent.id,
				seatId: seat.id,
				license: {
					customizeItems: [
						{
							feature_id: TestFeature.Users,
							price: {
								amount: 7,
								interval: BillingInterval.Month,
								billing_method: BillingMethod.Prepaid,
								billing_units: 2,
								processors: { stripe: { price_id: stripePrice.id } },
							},
						},
					],
					quantities: [
						{
							feature_id: TestFeature.Users,
							billing_behavior: BillingMethod.Prepaid,
							quantity: 5,
						},
					],
				},
			}),
		});

		// 5 users over packs of 2 → 3 packs × $9, the Stripe price's amount.
		const { stripeInvoice } = await expectCreatedInvoiceCorrect({
			ctx,
			response,
			lines: [{ amount: 27, quantity: 5 }],
			total: 27,
		});
		const line = stripeInvoice.lines.data[0];
		expect(line.pricing?.price_details?.price).toBe(stripePrice.id);
		expect(line.quantity).toBe(3);
	},
);
