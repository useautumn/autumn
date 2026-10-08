/**
 * invoices.create — entity scope.
 *
 * Contract:
 *   - `entity_id` scopes every plan; `plans[].entity_id` overrides it, and null is customer-level.
 *   - An unknown entity is a 400, preview or not, and is never auto-created.
 *   - Entity lines say so: preview `entity_id`, a "— <entity>" description suffix and items[].entities.
 *   - The invoice is tagged with an entity only when every plan line resolves to it.
 */

import { expect, test } from "bun:test";
import {
	type ApiListInvoiceV1,
	BillingMethod,
	type CreateInvoiceParamsInput,
	customers,
	ErrCode,
	entities,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { and, asc, eq } from "drizzle-orm";
import { CusService } from "@/internal/customers/CusService";
import { createInvoice } from "./utils/expectCreatedInvoiceCorrect";

type Client = Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];

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

const messages = (quantity: number) => ({
	feature_id: TestFeature.Messages,
	billing_behavior: BillingMethod.UsageBased,
	quantity,
});

const listInvoices = async ({
	autumnV2_3,
	params,
}: {
	autumnV2_3: Client;
	params: { customer_id: string; entity_id?: string };
}) =>
	(
		(await autumnV2_3.post("/invoices.list", params)) as {
			list: ApiListInvoiceV1[];
		}
	).list;

test.concurrent(
	`${chalk.yellowBright("invoices.create entities: a plan per entity attributes each line and leaves the invoice untagged")}`,
	async () => {
		const customerId = "inv-create-entities-per-plan";
		const { autumnV2_3, pro } = await setupEntityCustomer({ customerId });

		const response = await createInvoice({
			autumnV2_3,
			params: {
				customer_id: customerId,
				plans: [
					{
						plan_id: pro.id,
						entity_id: "ent-1",
						customize: { price: null },
						feature_quantities: [messages(100)],
					},
					{
						plan_id: pro.id,
						entity_id: "ent-2",
						customize: { price: null },
						feature_quantities: [messages(50)],
					},
				],
			},
		});

		const lines = response.preview.lines;
		expect(
			lines.map((line) => ({ entity_id: line.entity_id, amount: line.amount })),
		).toEqual([
			{ entity_id: "ent-1", amount: 10 },
			{ entity_id: "ent-2", amount: 5 },
		]);
		expect(lines[0].description).toMatch(/ — Entity 1$/);
		expect(lines[1].description).toMatch(/ — Entity 2$/);

		const invoice = (
			await listInvoices({
				autumnV2_3,
				params: { customer_id: customerId },
			})
		).find((candidate) => candidate.stripe_id === response.invoice?.stripe_id);
		expect(
			invoice?.items?.map((item) => ({
				amount: item.amount,
				entities: item.entities,
			})),
		).toEqual([
			{
				amount: 10,
				entities: [{ entity_id: "ent-1", quantity: 100, amount: 10 }],
			},
			{
				amount: 5,
				entities: [{ entity_id: "ent-2", quantity: 50, amount: 5 }],
			},
		]);

		// Mixed entities: the invoice carries no entity tag.
		const forEntity = await listInvoices({
			autumnV2_3,
			params: { customer_id: customerId, entity_id: "ent-1" },
		});
		expect(
			forEntity.some(
				(candidate) => candidate.stripe_id === response.invoice?.stripe_id,
			),
		).toBe(false);
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.create entities: a top-level entity_id scopes every plan and tags the invoice")}`,
	async () => {
		const customerId = "inv-create-entities-top-level";
		const { autumnV2_3, pro } = await setupEntityCustomer({ customerId });

		const response = await createInvoice({
			autumnV2_3,
			params: {
				customer_id: customerId,
				entity_id: "ent-2",
				plans: [{ plan_id: pro.id, feature_quantities: [messages(10)] }],
			},
		});

		expect(response.preview.lines.map((line) => line.entity_id)).toEqual([
			"ent-2",
			"ent-2",
		]);
		const forEntity = await listInvoices({
			autumnV2_3,
			params: { customer_id: customerId, entity_id: "ent-2" },
		});
		expect(
			forEntity.some(
				(candidate) => candidate.stripe_id === response.invoice?.stripe_id,
			),
		).toBe(true);
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.create entities: plans[].entity_id null is customer-level under a top-level entity")}`,
	async () => {
		const customerId = "inv-create-entities-null";
		const { autumnV2_3, pro } = await setupEntityCustomer({ customerId });

		const { preview } = await createInvoice({
			autumnV2_3,
			params: {
				customer_id: customerId,
				entity_id: "ent-1",
				preview: true,
				plans: [
					{
						plan_id: pro.id,
						entity_id: null,
						customize: { price: null },
						feature_quantities: [messages(10)],
					},
					{
						plan_id: pro.id,
						customize: { price: null },
						feature_quantities: [messages(20)],
					},
				],
			},
		});

		expect(preview.lines.map((line) => line.entity_id)).toEqual([
			null,
			"ent-1",
		]);
		expect(preview.lines[0].description).not.toMatch(/ — /);
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.create entities: lines without an entity preview entity_id null")}`,
	async () => {
		const customerId = "inv-create-entities-none";
		const { autumnV2_3, pro } = await setupEntityCustomer({ customerId });

		const { preview } = await createInvoice({
			autumnV2_3,
			params: {
				customer_id: customerId,
				preview: true,
				plans: [{ plan_id: pro.id, feature_quantities: [messages(10)] }],
				custom_line_items: [{ description: "Setup", amount: 5 }],
			},
		});
		expect(preview.lines.map((line) => line.entity_id)).toEqual([
			null,
			null,
			null,
		]);
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.create entities: an unknown entity is a 400 and is never created")}`,
	async () => {
		const customerId = "inv-create-entities-unknown";
		const { autumnV2_3, ctx, pro } = await setupEntityCustomer({ customerId });

		const requests: CreateInvoiceParamsInput[] = [
			{
				customer_id: customerId,
				entity_id: "ent-missing",
				preview: true,
				plans: [{ plan_id: pro.id }],
			},
			{
				customer_id: customerId,
				plans: [{ plan_id: pro.id, entity_id: "ent-missing" }],
			},
		];
		for (const params of requests) {
			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				func: () => createInvoice({ autumnV2_3, params }),
			});
		}

		const customer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
		});
		expect(customer.entities.map((entity) => entity.id).sort()).toEqual([
			"ent-1",
			"ent-2",
		]);
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.create entities: an older entity beyond the customer's hydrated page still resolves")}`,
	async () => {
		const customerId = "inv-create-entities-many";
		const pro = products.pro({
			id: `pro-${customerId}`,
			items: [items.consumableMessages({ price: 0.1 })],
		});
		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.entities({ count: 301, featureId: TestFeature.Users }),
			],
			actions: [],
		});

		// A full customer hydrates the 300 entities with the highest internal_id; take the one left out.
		const [oldest] = await ctx.db
			.select({ id: entities.id })
			.from(entities)
			.innerJoin(
				customers,
				eq(customers.internal_id, entities.internal_customer_id),
			)
			.where(
				and(
					eq(customers.id, customerId),
					eq(customers.org_id, ctx.org.id),
					eq(customers.env, ctx.env),
				),
			)
			.orderBy(asc(entities.internal_id))
			.limit(1);
		const { preview } = await createInvoice({
			autumnV2_3,
			params: {
				customer_id: customerId,
				preview: true,
				plans: [
					{
						plan_id: pro.id,
						entity_id: oldest.id as string,
						customize: { price: null },
						feature_quantities: [messages(10)],
					},
				],
			},
		});
		expect(preview.lines.map((line) => line.entity_id)).toEqual([oldest.id]);
	},
);
