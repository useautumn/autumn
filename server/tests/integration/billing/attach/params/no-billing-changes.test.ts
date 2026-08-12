import { expect, test } from "bun:test";
import type { ApiCustomerV3, AttachParamsV0Input } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { billingActions } from "@/internal/billing/v2/actions";
import { CusService } from "@/internal/customers/CusService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";

const withoutStripe = (ctx: TestContext): TestContext => ({
	...ctx,
	org: {
		...ctx.org,
		stripe_connected: false,
		stripe_config: null,
		test_stripe_connect: {},
	},
});

/**
 * Regression: a free plan attach with no_billing_changes should not require
 * the organization to have a Stripe account connected.
 */
test.concurrent(
	`${chalk.yellowBright("no_billing_changes: attaches a free plan without a Stripe connection")}`,
	async () => {
		const customerId = "no-billing-changes-free-plan-unlinked-org";
		const pro = products.base({
			id: "pro-free-unlinked-org",
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});

		await billingActions.attach({
			ctx: withoutStripe(ctx),
			params: {
				customer_id: customerId,
				plan_id: pro.id,
				no_billing_changes: true,
				redirect_mode: "never",
				enable_plan_immediately: true,
			},
		});
		await deleteCachedFullCustomer({ ctx, customerId });

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({ customer, active: [pro.id] });
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Credits,
			balance: 100,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("no_billing_changes: transitions priced plans without a Stripe connection")}`,
	async () => {
		const customerId = "no-billing-changes-priced-transition";
		const pro = products.pro({ id: "pro-unlinked-priced", items: [] });
		const premium = products.premium({
			id: "premium-unlinked-priced",
			items: [],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [pro, premium] }),
			],
			actions: [],
		});
		const noStripeCtx = withoutStripe(ctx);

		for (const plan of [pro, premium]) {
			await billingActions.attach({
				ctx: noStripeCtx,
				params: {
					customer_id: customerId,
					plan_id: plan.id,
					no_billing_changes: true,
					redirect_mode: "never",
				},
			});
			await deleteCachedFullCustomer({ ctx, customerId });
		}

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer,
			active: [premium.id],
			notPresent: [pro.id],
		});
	},
);

test.concurrent(`${chalk.yellowBright("no_billing_changes: attach with no_billing_changes does not create stripe customer")}`, async () => {
	const customerId = "no-billing-changes-no-stripe";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ id: "free", items: [messagesItem] });
	const pro = products.pro({ items: [messagesItem] });

	const { autumnV1, ctx } = await initScenario({
		setup: [
			s.deleteCustomer({ customerId }),
			s.products({ list: [free, pro], prefix: customerId }),
		],
		actions: [],
	});

	await autumnV1.customers.create({
		id: customerId,
		name: customerId,
		email: `${customerId}@example.com`,
		internalOptions: { disable_defaults: true },
	});

	await autumnV1.billing.attach<AttachParamsV0Input>({
		customer_id: customerId,
		product_id: free.id,
		no_billing_changes: true,
	});

	await autumnV1.billing.attach<AttachParamsV0Input>({
		customer_id: customerId,
		product_id: pro.id,
		no_billing_changes: true,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id],
		notPresent: [free.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 100,
	});

	const dbCustomer = await CusService.get({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	expect(dbCustomer?.processor?.id).toBeUndefined();

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

/**
 * Regression: a no-write transition after disconnecting Stripe must retain the
 * existing subscription and schedule linkage stored in Autumn.
 */
test.concurrent(`${chalk.yellowBright("no_billing_changes: carries billing linkage forward after Stripe disconnect")}`, async () => {
	const customerId = "no-billing-changes-paid-current";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro-nbc-paid-current",
		items: [messagesItem],
	});
	const premium = products.premium({
		id: "premium-nbc-paid-current",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const beforeFullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const beforeProCusProduct = beforeFullCustomer.customer_products.find(
		(cp) => cp.product.id === pro.id,
	);
	const expectedSubscriptionIds = beforeProCusProduct?.subscription_ids ?? [];
	expect(expectedSubscriptionIds.length).toBeGreaterThan(0);
	const expectedScheduleIds = ["sub_sched_disconnected"];
	await CusProductService.update({
		ctx,
		cusProductId: beforeProCusProduct!.id,
		updates: { scheduled_ids: expectedScheduleIds },
	});
	await deleteCachedFullCustomer({ ctx, customerId });

	await billingActions.attach({
		ctx: withoutStripe(ctx),
		params: {
			customer_id: customerId,
			plan_id: premium.id,
			no_billing_changes: true,
			redirect_mode: "never",
		},
	});
	await deleteCachedFullCustomer({ ctx, customerId });

	const afterCustomer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: afterCustomer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	const afterFullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const afterPremiumCusProduct = afterFullCustomer.customer_products.find(
		(cp) => cp.product.id === premium.id,
	);

	expect(afterPremiumCusProduct?.subscription_ids).toEqual(
		expectedSubscriptionIds,
	);
	expect(afterPremiumCusProduct?.scheduled_ids).toEqual(expectedScheduleIds);
});
