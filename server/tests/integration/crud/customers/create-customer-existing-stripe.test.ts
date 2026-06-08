import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";

const uniqueSuffix = () => Math.random().toString(36).slice(2, 10);

// Contract: create_in_stripe on an existing Autumn customer ensures one Stripe processor.
test.concurrent(
	`${chalk.yellowBright("customers: existing customer create_in_stripe creates Stripe customer")}`,
	async () => {
		const suffix = uniqueSuffix();
		const customerId = `existing-stripe-${suffix}`;
		const email = `${customerId}@example.com`;

		const { autumnV1, autumnV2_1, ctx } = await initScenario({
			setup: [s.deleteCustomer({ customerId })],
			actions: [],
		});

		const initial = await autumnV1.customers.create({
			id: customerId,
			name: "Existing Stripe",
			email,
			internalOptions: { disable_defaults: true },
		});
		expect(initial.stripe_id).toBeNull();

		const createdInStripe = await autumnV1.customers.create({
			id: customerId,
			name: "Existing Stripe",
			email,
			create_in_stripe: true,
			internalOptions: { disable_defaults: true },
		});

		expect(createdInStripe.stripe_id).toMatch(/^cus_/);

		const apiCustomer =
			await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expect(apiCustomer.processors?.stripe?.id).toBe(createdInStripe.stripe_id);

		const fromDb = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		expect(fromDb.processor?.id).toBe(createdInStripe.stripe_id);

		const second = await autumnV1.customers.create({
			id: customerId,
			name: "Existing Stripe",
			email,
			create_in_stripe: true,
			internalOptions: { disable_defaults: true },
		});
		expect(second.stripe_id).toBe(createdInStripe.stripe_id);

		const stripeCustomers = await ctx.stripeCli.customers.list({ email });
		expect(stripeCustomers.data.map((customer) => customer.id)).toContain(
			createdInStripe.stripe_id,
		);
		expect(
			stripeCustomers.data.filter(
				(customer) => customer.id === second.stripe_id,
			),
		).toHaveLength(1);
	},
);

test.concurrent(
	`${chalk.yellowBright("customers: concurrent existing create_in_stripe with paid default is idempotent")}`,
	async () => {
		const suffix = uniqueSuffix();
		const customerId = `existing-stripe-race-${suffix}`;
		const email = `${customerId}@example.com`;
		const paidDefault = products.defaultTrial({
			id: "existing-stripe-race-default",
			items: [items.monthlyMessages({ includedUsage: 100 })],
			trialDays: 14,
			cardRequired: false,
		});

		const { autumnV1, ctx } = await initScenario({
			setup: [
				s.deleteCustomer({ customerId }),
				s.products({ list: [paidDefault], prefix: customerId }),
			],
			actions: [],
		});

		await autumnV1.customers.create({
			id: customerId,
			name: "Existing Stripe Race",
			email,
			internalOptions: { disable_defaults: true },
		});

		const results = await Promise.all(
			Array.from({ length: 5 }, () =>
				autumnV1.customers.create({
					id: customerId,
					name: "Existing Stripe Race",
					email,
					create_in_stripe: true,
					internalOptions: { default_group: customerId },
				}),
			),
		);

		const stripeIds = results.map((result) => result.stripe_id);
		expect(new Set(stripeIds).size).toBe(1);
		expect(stripeIds[0]).toMatch(/^cus_/);

		const fromDb = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		expect(fromDb.processor?.id).toBe(stripeIds[0]);
		expect(fromDb.customer_products).toHaveLength(0);

		const subscriptions = await ctx.stripeCli.subscriptions.list({
			customer: stripeIds[0],
			status: "all",
		});
		expect(subscriptions.data).toHaveLength(0);
	},
);
