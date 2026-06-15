/**
 * TDD coverage for update_plan item patch migrations.
 *
 * Contract under test:
 *   - update_plan reuses update-subscription patch semantics for add_items,
 *     remove_items, usage carry, and rollover carry.
 *   - Migration execution does not create extra invoices.
 *   - Existing customer products are patched, not replaced or expired.
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	ApiCustomerV5,
	AttachParamsV1Input,
	UsagePriceConfig,
} from "@autumn/shared";
import { BillingMethod } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoExpiredCustomerProducts } from "@tests/integration/billing/utils/expectNoExpiredCustomerProducts";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectStripeSubscriptionUnchanged } from "@tests/integration/billing/utils/stripe/expectStripeSubscriptionUnchanged";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { expectFlagCorrect } from "@tests/integration/utils/expectFlagCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";
import { getRelatedCusPrice } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils";
import { PriceService } from "@/internal/products/prices/PriceService";
import { ProductService } from "@/internal/products/ProductService";
import { runUpdatePlanMigration } from "../../utils/runUpdatePlanMigration";

const removeAllocatedBillingBehavior = ({
	config,
}: {
	config: UsagePriceConfig;
}) => {
	const {
		allocated_billing_behavior: _allocatedBillingBehavior,
		...legacyConfig
	} = config;

	return legacyConfig;
};

test.concurrent(
	`${chalk.yellowBright("migrations update_plan: consumable paid feature carries usage without charging")}`,
	async () => {
		const customerId = "migration-update-paid-consumable";
		const messagesUsage = 60;
		const included = 50;
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV1, autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: messagesUsage,
			},
			{ timeout: 2000 },
		);

		await runUpdatePlanMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: `${customerId}-mig`,
			customerId,
			filter: { customer: { plan: { plan_id: pro.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: pro.id },
						customize: {
							remove_items: [{ feature_id: TestFeature.Messages }],
							add_items: [
								itemsV2.dashboard(),
								{
									...itemsV2.consumableMessages({ amount: 0.1 }),
									included,
								},
							],
						},
					},
				],
			},
			runOnServer: false,
		});

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({ customer, active: [pro.id] });
		expectFlagCorrect({
			customer,
			featureId: TestFeature.Dashboard,
			planId: pro.id,
		});
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			remaining: 0,
			usage: messagesUsage,
			planId: pro.id,
			breakdown: {
				[BillingMethod.UsageBased]: {
					included_grant: included,
					remaining: 0,
					usage: messagesUsage,
				},
			},
		});
		await expectCustomerInvoiceCorrect({
			customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
			count: 1,
			latestTotal: 20,
		});
		await expectNoExpiredCustomerProducts({
			ctx,
			customerId,
			productId: pro.id,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

// Red: migration update_plan creates the new prepaid users item with zero paid packs.
// Green: same-feature usage below the old allowance still synthesizes paid packs.
test.concurrent(
	`${chalk.yellowBright("migrations update_plan: prepaid users replacement keeps carried usage quantity")}`,
	async () => {
		const customerId = "migration-update-paid-prepaid-users";
		const usersUsage = 8;
		const pro = products.pro({
			id: "migration-update-paid-prepaid-users-plan",
			items: [items.monthlyUsers({ includedUsage: 10 })],
		});

		const { autumnV1, autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.track({
					featureId: TestFeature.Users,
					value: usersUsage,
					timeout: 2000,
				}),
			],
		});

		const invoiceCountBefore =
			(await autumnV1.customers.get<ApiCustomerV3>(customerId)).invoices
				?.length ?? 0;

		await runUpdatePlanMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: `${customerId}-mig`,
			customerId,
			filter: { customer: { plan: { plan_id: pro.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: pro.id },
						customize: {
							remove_items: [{ feature_id: TestFeature.Users }],
							add_items: [
								itemsV2.prepaidUsers({
									amount: 10,
									included: 1,
								}),
							],
						},
					},
				],
			},
			runOnServer: false,
		});

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({ customer, active: [pro.id] });
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Users,
			remaining: 0,
			usage: usersUsage,
			planId: pro.id,
			breakdown: {
				[BillingMethod.Prepaid]: {
					included_grant: 1,
					prepaid_grant: 7,
					remaining: 0,
					usage: usersUsage,
				},
			},
		});
		await expectCustomerInvoiceCorrect({
			customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
			count: invoiceCountBefore,
		});
		await expectNoExpiredCustomerProducts({
			ctx,
			customerId,
			productId: pro.id,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("migrations update_plan: allocated v1 stays prorated after migration")}`,
	async () => {
		const customerId = "migration-update-paid-allocated-v1";
		const pro = products.pro({
			id: "migration-update-paid-allocated-v1-plan",
			items: [items.allocatedUsers({ includedUsage: 1 })],
		});

		const { autumnV1, autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const fullProduct = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: pro.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		const allocatedPrice = fullProduct.prices.find(
			(price) =>
				(price.config as UsagePriceConfig).feature_id === TestFeature.Users,
		);
		if (!allocatedPrice) {
			throw new Error("Expected allocated users price on pro plan");
		}

		await PriceService.update({
			db: ctx.db,
			id: allocatedPrice.id,
			update: {
				config: removeAllocatedBillingBehavior({
					config: allocatedPrice.config as UsagePriceConfig,
				}),
			},
		});

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			redirect_mode: "if_required",
		});

		const invoiceCountBeforeMigration =
			(await autumnV1.customers.get<ApiCustomerV3>(customerId)).invoices
				?.length ?? 0;

		await runUpdatePlanMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: `${customerId}-mig`,
			customerId,
			filter: { customer: { plan: { plan_id: pro.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: pro.id },
						customize: {
							add_items: [itemsV2.dashboard()],
						},
					},
				],
			},
			runOnServer: false,
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			skipReset: true,
		});
		const cusProduct = fullCustomer.customer_products.find(
			(product) => product.product.id === pro.id,
		);
		const usersCusEnt = cusProduct?.customer_entitlements.find(
			(cusEnt) => cusEnt.entitlement.feature_id === TestFeature.Users,
		);
		if (!cusProduct || !usersCusEnt) {
			throw new Error(
				"Expected migrated customer product with users entitlement",
			);
		}

		const usersCusPrice = getRelatedCusPrice(
			usersCusEnt,
			cusProduct.customer_prices,
		);
		const usersPriceConfig = usersCusPrice?.price.config as
			| UsagePriceConfig
			| undefined;
		expect(usersPriceConfig?.allocated_billing_behavior).toBeUndefined();
		expect(usersPriceConfig?.should_prorate).toBe(true);

		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Users,
				value: 2,
			},
			{ timeout: 2000 },
		);

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({ customer, active: [pro.id] });
		expectFlagCorrect({
			customer,
			featureId: TestFeature.Dashboard,
			planId: pro.id,
		});
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Users,
			remaining: 0,
			usage: 2,
			planId: pro.id,
			nextResetAt: null,
		});
		await expectCustomerInvoiceCorrect({
			customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
			count: invoiceCountBeforeMigration + 1,
			latestTotal: 10,
		});
		await expectNoExpiredCustomerProducts({
			ctx,
			customerId,
			productId: pro.id,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("migrations update_plan: no_billing_changes remove paid feature stays DB-only")}`,
	async () => {
		const customerId = "migration-update-paid-remove-no-billing";
		const pro = products.pro({
			id: "migration-update-paid-remove-no-billing-plan",
			items: [items.consumableMessages({ includedUsage: 100, price: 0.1 })],
		});

		const { autumnV1, autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const invoiceCountBefore = customerBefore.invoices?.length ?? 0;
		const subsBefore = await ctx.stripeCli.subscriptions.list({
			customer: customerBefore.stripe_id as string,
			status: "all",
		});
		const subBefore = subsBefore.data.find(
			(sub) => sub.status === "active" || sub.status === "trialing",
		);
		expect(subBefore).toBeDefined();

		await runUpdatePlanMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: `${customerId}-mig`,
			customerId,
			filter: { customer: { plan: { plan_id: pro.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: pro.id },
						customize: {
							remove_items: [{ feature_id: TestFeature.Messages }],
						},
					},
				],
			},
			noBillingChanges: true,
			runOnServer: false,
		});

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({ customer, active: [pro.id] });
		expect(customer.balances[TestFeature.Messages]).toBeUndefined();
		await expectNoExpiredCustomerProducts({
			ctx,
			customerId,
			productId: pro.id,
		});

		const subAfter = await ctx.stripeCli.subscriptions.retrieve(subBefore!.id);
		expectStripeSubscriptionUnchanged({ before: subBefore!, after: subAfter });
		await expectCustomerInvoiceCorrect({
			customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
			count: invoiceCountBefore,
		});
	},
);
