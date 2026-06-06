/**
 * TDD test for Connect subscriptions created by another application.
 *
 * Red-failure mode (current behavior):
 *  - Autumn can create and pay a manual update invoice before Stripe rejects the subscription update.
 *
 * Green-success criteria (after fix):
 *  - The update throws before creating another invoice.
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, BillingInterval, ErrCode } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";
import { billingActions } from "@/internal/billing/v2/actions";
import { CusService } from "@/internal/customers/CusService";

test.concurrent(
	`${chalk.yellowBright("error: mismatched Connect application rejects before invoice")}`,
	async () => {
		const customerId = "foreign-connect-sub-update";
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({
			id: "pro",
			items: [messagesItem, priceItem],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const stripeCustomer = (await ctx.stripeCli.customers.retrieve(
			fullCustomer.processor.id!,
		)) as Stripe.Customer;
		const stripeSubscriptions = await ctx.stripeCli.subscriptions.list({
			customer: stripeCustomer.id,
			status: "all",
			limit: 1,
		});
		const stripeSubscription = stripeSubscriptions.data[0];
		expect(stripeSubscription).toBeDefined();

		const paymentMethods = await ctx.stripeCli.paymentMethods.list({
			customer: stripeCustomer.id,
			type: "card",
			limit: 1,
		});

		let thrown: unknown;
		try {
			await billingActions.updateSubscription({
				ctx,
				params: {
					customer_id: customerId,
					plan_id: pro.id,
					customize: {
						price: {
							amount: 30,
							interval: BillingInterval.Month,
						},
					},
				},
				contextOverride: {
					stripeBillingContext: {
						stripeCustomer,
						stripeSubscription: {
							...stripeSubscription,
							application: "ca_foreign_app",
						},
						stripeDiscounts: [],
						paymentMethod: paymentMethods.data[0],
					},
				},
			});
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toBeDefined();
		expect((thrown as { code?: string }).code).toBe(ErrCode.InvalidRequest);
		expect((thrown as Error).message).toContain(
			"Cannot update subscription because it was not created by Autumn",
		);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer,
			count: 1,
			latestTotal: 20,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("Connect subscription ownership: null application is allowed")}`,
	async () => {
		const customerId = "connect-null-application-sub";
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({
			id: "pro",
			items: [messagesItem, priceItem],
		});

		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const stripeCustomer = (await ctx.stripeCli.customers.retrieve(
			fullCustomer.processor.id!,
		)) as Stripe.Customer;
		const stripeSubscriptions = await ctx.stripeCli.subscriptions.list({
			customer: stripeCustomer.id,
			status: "all",
			limit: 1,
		});
		const stripeSubscription = stripeSubscriptions.data[0];
		expect(stripeSubscription).toBeDefined();

		await expect(
			billingActions.updateSubscription({
				ctx,
				preview: true,
				params: {
					customer_id: customerId,
					plan_id: pro.id,
					customize: {
						price: {
							amount: 30,
							interval: BillingInterval.Month,
						},
					},
				},
				contextOverride: {
					stripeBillingContext: {
						stripeCustomer,
						stripeSubscription: {
							...stripeSubscription,
							application: null,
						},
						stripeDiscounts: [],
					},
				},
			}),
		).resolves.toBeDefined();
	},
);

test.concurrent(
	`${chalk.yellowBright("secret-key subscription ownership: null application is allowed")}`,
	async () => {
		const customerId = "secret-key-sub-ownership";
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({
			id: "pro",
			items: [messagesItem, priceItem],
		});

		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const stripeCustomer = (await ctx.stripeCli.customers.retrieve(
			fullCustomer.processor.id!,
		)) as Stripe.Customer;
		const stripeSubscriptions = await ctx.stripeCli.subscriptions.list({
			customer: stripeCustomer.id,
			status: "all",
			limit: 1,
		});
		const stripeSubscription = stripeSubscriptions.data[0];
		expect(stripeSubscription).toBeDefined();

		const secretKeyCtx = {
			...ctx,
			org: {
				...ctx.org,
				stripe_config: {
					...ctx.org.stripe_config,
					test_api_key: "present-for-ownership-check",
				},
			},
		};

		await expect(
			billingActions.updateSubscription({
				ctx: secretKeyCtx,
				preview: true,
				params: {
					customer_id: customerId,
					plan_id: pro.id,
					customize: {
						price: {
							amount: 30,
							interval: BillingInterval.Month,
						},
					},
				},
				contextOverride: {
					stripeBillingContext: {
						stripeCustomer,
						stripeSubscription: {
							...stripeSubscription,
							application: null,
						},
						stripeDiscounts: [],
					},
				},
			}),
		).resolves.toBeDefined();
	},
);
