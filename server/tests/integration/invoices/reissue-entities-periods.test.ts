/**
 * invoices.reissue — line periods and entity attribution.
 *
 * Contract:
 *   - Copied lines keep their Stripe period and their entity attribution; an amount edit moves the entity's share too.
 *   - A catalog plan added on reissue resolves its period like invoices.create and is attributed to its entity.
 */

import { expect, test } from "bun:test";
import {
	type ApiListInvoiceV1,
	BillingMethod,
	type CreateInvoiceResponse,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

type Scenario = Awaited<ReturnType<typeof initScenario>>;

const JAN_1 = Date.UTC(2026, 0, 1);
const JAN_16 = Date.UTC(2026, 0, 16);
const FEB_1 = Date.UTC(2026, 1, 1);

const messages = (quantity: number) => ({
	feature_id: TestFeature.Messages,
	billing_behavior: BillingMethod.UsageBased,
	quantity,
});

const setupEntityCustomer = async ({ customerId }: { customerId: string }) => {
	const pro = products.pro({
		id: `pro-${customerId}`,
		items: [items.consumableMessages({ price: 0.1 })],
	});
	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [],
	});
	return { ...scenario, pro };
};

const invoiceByStripeId = async ({
	autumnV2_3,
	customerId,
	stripeId,
}: {
	autumnV2_3: Scenario["autumnV2_3"];
	customerId: string;
	stripeId: string;
}) => {
	const { list } = (await autumnV2_3.post("/invoices.list", {
		customer_id: customerId,
	})) as { list: ApiListInvoiceV1[] };
	const invoice = list.find((candidate) => candidate.stripe_id === stripeId);
	if (!invoice) throw new Error(`invoice ${stripeId} not listed`);
	return invoice;
};

const lineFacts = (invoice: ApiListInvoiceV1) =>
	(invoice.items ?? [])
		.map((item) => ({
			amount: item.amount,
			period: [item.period_start, item.period_end],
			entities: item.entities,
		}))
		.sort((a, b) => b.amount - a.amount);

test.concurrent(
	`${chalk.yellowBright("invoices.reissue: copied lines keep their period and entity, and an amount edit moves the entity's share")}`,
	async () => {
		const customerId = "inv-reissue-entities-periods";
		const { autumnV2_3, pro } = await setupEntityCustomer({ customerId });

		const created = (await autumnV2_3.post("/invoices.create", {
			customer_id: customerId,
			plans: [
				{
					plan_id: pro.id,
					entity_id: "ent-1",
					customize: { price: null },
					period_start: JAN_1,
					period_end: JAN_16,
					feature_quantities: [messages(100)],
				},
				{
					plan_id: pro.id,
					entity_id: "ent-2",
					customize: { price: null },
					feature_quantities: [
						{ ...messages(50), period_start: JAN_16, period_end: FEB_1 },
					],
				},
			],
		})) as CreateInvoiceResponse;
		const original = await invoiceByStripeId({
			autumnV2_3,
			customerId,
			stripeId: created.invoice?.stripe_id as string,
		});
		const entityTwoLine = original.items?.find(
			(item) => item.entities[0]?.entity_id === "ent-2",
		);

		const { invoice } = (await autumnV2_3.post("/invoices.reissue", {
			invoice_id: original.id,
			lines: { update: [{ id: entityTwoLine?.id, amount: 7 }] },
		})) as { invoice: ApiListInvoiceV1 };

		expect(lineFacts(invoice)).toEqual([
			{
				amount: 10,
				period: [JAN_1, JAN_16],
				entities: [{ entity_id: "ent-1", quantity: 100, amount: 10 }],
			},
			{
				amount: 7,
				period: [JAN_16, FEB_1],
				entities: [{ entity_id: "ent-2", quantity: 50, amount: 7 }],
			},
		]);
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.reissue: a catalog plan added on reissue takes its own period and bills to its entity")}`,
	async () => {
		const customerId = "inv-reissue-entities-add";
		const { autumnV2_3, pro } = await setupEntityCustomer({ customerId });

		const created = (await autumnV2_3.post("/invoices.create", {
			customer_id: customerId,
			plans: [
				{
					plan_id: pro.id,
					entity_id: "ent-1",
					customize: { price: null },
					feature_quantities: [messages(10)],
				},
			],
		})) as CreateInvoiceResponse;
		const original = await invoiceByStripeId({
			autumnV2_3,
			customerId,
			stripeId: created.invoice?.stripe_id as string,
		});

		const lines = {
			add: [
				{
					plan_id: pro.id,
					entity_id: "ent-2",
					customize: { price: null },
					period_start: JAN_1,
					period_end: JAN_16,
					feature_quantities: [messages(20)],
				},
			],
		};
		const addedEntityIds = (preview: CreateInvoiceResponse["preview"]) =>
			preview.lines.map((line) => line.entity_id);

		const dryRun = (await autumnV2_3.post("/invoices.reissue", {
			invoice_id: original.id,
			preview: true,
			lines,
		})) as { preview: CreateInvoiceResponse["preview"] };
		expect(addedEntityIds(dryRun.preview).sort()).toEqual(["ent-1", "ent-2"]);

		const { invoice, preview } = (await autumnV2_3.post("/invoices.reissue", {
			invoice_id: original.id,
			lines,
		})) as {
			invoice: ApiListInvoiceV1;
			preview: CreateInvoiceResponse["preview"];
		};
		expect(addedEntityIds(preview).sort()).toEqual(["ent-1", "ent-2"]);

		const added = invoice.items?.find((item) => item.amount === 2);
		expect(added?.description).toMatch(/ — Entity 2$/);
		expect({
			period: [added?.period_start, added?.period_end],
			entities: added?.entities,
		}).toEqual({
			period: [JAN_1, JAN_16],
			entities: [{ entity_id: "ent-2", quantity: 20, amount: 2 }],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.reissue: an unedited discounted entity line keeps its entity share")}`,
	async () => {
		const customerId = "inv-reissue-entities-discount";
		const { autumnV2_3, ctx, pro } = await setupEntityCustomer({ customerId });
		const coupon = await ctx.stripeCli.coupons.create({
			percent_off: 50,
			duration: "once",
		});

		const created = (await autumnV2_3.post("/invoices.create", {
			customer_id: customerId,
			plans: [
				{
					plan_id: pro.id,
					entity_id: "ent-1",
					customize: { price: null },
					discounts: [{ reward_id: coupon.id }],
					feature_quantities: [messages(100)],
				},
			],
		})) as CreateInvoiceResponse;
		const original = await invoiceByStripeId({
			autumnV2_3,
			customerId,
			stripeId: created.invoice?.stripe_id as string,
		});
		const originalShare = original.items?.[0]?.entities;

		const { invoice } = (await autumnV2_3.post("/invoices.reissue", {
			invoice_id: original.id,
		})) as { invoice: ApiListInvoiceV1 };

		expect(invoice.items?.[0]?.entities).toEqual(originalShare);
	},
);
