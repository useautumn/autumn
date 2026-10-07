/**
 * invoices.create — customize.items supplying a feature price the catalog plan
 * does not have, for this invoice only.
 */

import { expect, test } from "bun:test";
import {
	BillingInterval,
	BillingMethod,
	ErrCode,
	isPrepaidPrice,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService";
import {
	createInvoice,
	expectCreatedInvoiceCorrect,
} from "./utils/expectCreatedInvoiceCorrect";

test.concurrent(
	`${chalk.yellowBright("invoices.create: customize.items bills a feature the plan has no price for")}`,
	async () => {
		const customerId = "inv-create-customize-new-price";
		const pro = products.pro({
			id: "pro-create-customize-new",
			items: [items.prepaidUsers()],
		});
		const { ctx, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const response = await createInvoice({
			autumnV2_3,
			params: {
				customer_id: customerId,
				plans: [
					{
						plan_id: pro.id,
						customize: {
							price: null,
							items: [
								{
									feature_id: TestFeature.Messages,
									price: {
										amount: 0.5,
										interval: BillingInterval.Month,
										billing_method: BillingMethod.UsageBased,
										billing_units: 1,
									},
								},
							],
						},
						feature_quantities: [
							{
								feature_id: TestFeature.Messages,
								billing_behavior: BillingMethod.UsageBased,
								quantity: 10,
							},
						],
					},
				],
			},
		});

		await expectCreatedInvoiceCorrect({
			ctx,
			response,
			lines: [{ amount: 5, quantity: 10, prorated: false }],
			total: 5,
		});

		const catalog = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: pro.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		expect(
			catalog.prices.some(
				(price) => price.config.feature_id === TestFeature.Messages,
			),
		).toBe(false);
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.create: customize.items switches a feature's billing method for this invoice")}`,
	async () => {
		const customerId = "inv-create-customize-switch";
		const pro = products.pro({
			id: "pro-create-customize-switch",
			items: [items.prepaidUsers()],
		});
		const { ctx, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const response = await createInvoice({
			autumnV2_3,
			params: {
				customer_id: customerId,
				plans: [
					{
						plan_id: pro.id,
						customize: {
							price: null,
							items: [
								{
									feature_id: TestFeature.Users,
									price: {
										amount: 3,
										interval: BillingInterval.Month,
										billing_method: BillingMethod.UsageBased,
										billing_units: 1,
									},
								},
							],
						},
						feature_quantities: [
							{
								feature_id: TestFeature.Users,
								billing_behavior: BillingMethod.UsageBased,
								quantity: 4,
							},
						],
					},
				],
			},
		});

		await expectCreatedInvoiceCorrect({
			ctx,
			response,
			lines: [{ amount: 12, quantity: 4, prorated: false }],
			total: 12,
		});

		const catalog = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: pro.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		const usersPrices = catalog.prices.filter(
			(price) => price.config.feature_id === TestFeature.Users,
		);
		expect(usersPrices).toHaveLength(1);
		expect(isPrepaidPrice(usersPrices[0])).toBe(true);
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.create: a feature with no catalog or customized price for the behavior is refused")}`,
	async () => {
		const customerId = "inv-create-customize-mismatch";
		const pro = products.pro({
			id: "pro-create-customize-mismatch",
			items: [items.prepaidUsers()],
		});
		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const invoiceFor = ({
			customizedMethod,
		}: {
			customizedMethod?: BillingMethod;
		}) =>
			createInvoice({
				autumnV2_3,
				params: {
					customer_id: customerId,
					plans: [
						{
							plan_id: pro.id,
							...(customizedMethod
								? {
										customize: {
											items: [
												{
													feature_id: TestFeature.Messages,
													price: {
														amount: 0.5,
														interval: BillingInterval.Month,
														billing_method: customizedMethod,
														billing_units: 1,
													},
												},
											],
										},
									}
								: {}),
							feature_quantities: [
								{
									feature_id: TestFeature.Messages,
									billing_behavior: BillingMethod.UsageBased,
									quantity: 10,
								},
							],
						},
					],
					preview: true,
				},
			});

		for (const customizedMethod of [undefined, BillingMethod.Prepaid]) {
			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				func: () => invoiceFor({ customizedMethod }),
			});
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.create: a feature customized to a zero price bills nothing for it")}`,
	async () => {
		const customerId = "inv-create-customize-zero";
		const pro = products.pro({
			id: "pro-create-customize-zero",
			items: [items.prepaidUsers()],
		});
		const { ctx, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const response = await createInvoice({
			autumnV2_3,
			params: {
				customer_id: customerId,
				plans: [
					{
						plan_id: pro.id,
						customize: {
							price: null,
							items: [
								{
									feature_id: TestFeature.Messages,
									price: {
										amount: 0,
										interval: BillingInterval.Month,
										billing_method: BillingMethod.UsageBased,
										billing_units: 1,
									},
								},
							],
						},
						feature_quantities: [
							{
								feature_id: TestFeature.Users,
								billing_behavior: BillingMethod.Prepaid,
								quantity: 2,
							},
							{
								feature_id: TestFeature.Messages,
								billing_behavior: BillingMethod.UsageBased,
								quantity: 10,
							},
						],
					},
				],
			},
		});

		// 2 users × $10; the zero-priced messages add no line.
		await expectCreatedInvoiceCorrect({
			ctx,
			response,
			lines: [{ amount: 20, quantity: 2 }],
			total: 20,
		});
	},
);
