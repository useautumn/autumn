import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiCustomerV5,
	CusProductStatus,
} from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectCustomerProductStatuses } from "@tests/integration/billing/utils/expectCustomerProductStatuses";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";
import { CusService } from "@/internal/customers/CusService";
import { ProductService } from "@/internal/products/ProductService";
import { attachPaymentMethod } from "@/utils/scriptUtils/initCustomer";

const runId = Date.now().toString(36);

const getFullProduct = ({
	ctx,
	productId,
}: {
	ctx: TestContext;
	productId: string;
}) =>
	ProductService.getFull({
		db: ctx.db,
		idOrInternalId: productId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

const getBasePriceId = async ({
	ctx,
	productId,
}: {
	ctx: TestContext;
	productId: string;
}) => {
	const product = await getFullProduct({ ctx, productId });
	const stripePriceId = product.prices.find(
		(price) => price.config.stripe_price_id,
	)?.config.stripe_price_id;
	if (!stripePriceId) throw new Error(`${productId} has no Stripe base price`);
	return stripePriceId;
};

const createStripeCustomer = async ({
	ctx,
	key,
}: {
	ctx: TestContext;
	key: string;
}) => {
	const customer = await ctx.stripeCli.customers.create({
		email: `${key}-${runId}@example.com`,
	});
	await attachPaymentMethod({
		stripeCli: ctx.stripeCli,
		stripeCusId: customer.id,
		type: "success",
	});
	return customer;
};

const createSubscription = ({
	ctx,
	stripeCustomerId,
	items: subscriptionItems,
}: {
	ctx: TestContext;
	stripeCustomerId: string;
	items: Stripe.SubscriptionCreateParams.Item[];
}) =>
	ctx.stripeCli.subscriptions.create({
		customer: stripeCustomerId,
		items: subscriptionItems,
	});

const createAutumnCustomer = ({
	autumnV1,
	customerId,
	stripeCustomerId,
	disableDefaults = true,
	defaultGroup,
}: {
	autumnV1: Awaited<ReturnType<typeof initScenario>>["autumnV1"];
	customerId: string;
	stripeCustomerId?: string;
	disableDefaults?: boolean;
	defaultGroup?: string;
}) =>
	autumnV1.customers.create({
		id: customerId,
		stripe_id: stripeCustomerId,
		internalOptions: disableDefaults
			? { disable_defaults: true }
			: defaultGroup
				? { default_group: defaultGroup }
				: undefined,
	});

test(`${chalk.yellowBright("customers stripe sync: no stripe id preserves normal creation")}`, async () => {
	const customerId = `create-stripe-sync-none-${runId}`;
	const defaultGroup = `create-stripe-sync-none-group-${runId}`;
	const freeDefault = products.base({
		id: `create-stripe-sync-free-${runId}`,
		items: [items.monthlyMessages({ includedUsage: 50 })],
		isDefault: true,
		group: defaultGroup,
	});
	const { autumnV1, ctx } = await initScenario({
		setup: [
			s.deleteCustomer({ customerId }),
			s.products({ list: [freeDefault] }),
		],
		actions: [],
	});

	const created = await createAutumnCustomer({
		autumnV1,
		customerId,
		disableDefaults: false,
		defaultGroup,
	});
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	expect(created.stripe_id).toBeNull();
	await expectProductActive({ customer: created, productId: freeDefault.id });
	expectCustomerFeatureCorrect({
		customer: created,
		featureId: TestFeature.Messages,
		balance: 50,
		usage: 0,
	});
	expect(fullCustomer.customer_products).toHaveLength(1);
});

test(`${chalk.yellowBright("customers stripe sync: empty stripe customer preserves defaults")}`, async () => {
	const customerId = `create-stripe-sync-empty-${runId}`;
	const defaultGroup = `create-stripe-sync-empty-group-${runId}`;
	const freeDefault = products.base({
		id: `create-stripe-sync-empty-free-${runId}`,
		items: [items.monthlyMessages({ includedUsage: 75 })],
		isDefault: true,
		group: defaultGroup,
	});
	const { autumnV1, ctx } = await initScenario({
		setup: [
			s.deleteCustomer({ customerId }),
			s.products({ list: [freeDefault] }),
		],
		actions: [],
	});
	const stripeCustomer = await createStripeCustomer({ ctx, key: customerId });

	const created = await createAutumnCustomer({
		autumnV1,
		customerId,
		stripeCustomerId: stripeCustomer.id,
		disableDefaults: false,
		defaultGroup,
	});
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	expect(created.stripe_id).toBe(stripeCustomer.id);
	await expectProductActive({ customer: created, productId: freeDefault.id });
	expectCustomerFeatureCorrect({
		customer: created,
		featureId: TestFeature.Messages,
		balance: 75,
		usage: 0,
	});
	expect(fullCustomer.customer_products).toHaveLength(1);
	expect(fullCustomer.customer_products[0]?.subscription_ids ?? []).toEqual([]);
});

test(`${chalk.yellowBright("customers stripe sync: existing stripe subscription is not duplicated by a paid default")}`, async () => {
	const customerId = `create-stripe-sync-paid-default-${runId}`;
	const defaultGroup = `create-stripe-sync-paid-default-group-${runId}`;
	const paidDefault = {
		...products.defaultTrial({
			id: `create-stripe-sync-paid-default-plan-${runId}`,
			items: [items.monthlyMessages({ includedUsage: 125 })],
			trialDays: 14,
			cardRequired: false,
		}),
		group: defaultGroup,
	};
	const { autumnV1, ctx } = await initScenario({
		setup: [
			s.deleteCustomer({ customerId }),
			s.products({ list: [paidDefault] }),
		],
		actions: [],
	});
	const stripeCustomer = await createStripeCustomer({ ctx, key: customerId });
	const stripeSubscription = await createSubscription({
		ctx,
		stripeCustomerId: stripeCustomer.id,
		items: [
			{
				price: await getBasePriceId({ ctx, productId: paidDefault.id }),
			},
		],
	});

	await createAutumnCustomer({
		autumnV1,
		customerId,
		stripeCustomerId: stripeCustomer.id,
		disableDefaults: false,
		defaultGroup,
	});
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const subscriptions = await ctx.stripeCli.subscriptions.list({
		customer: stripeCustomer.id,
		status: "all",
	});

	expect(fullCustomer.customer_products).toHaveLength(1);
	expect(fullCustomer.customer_products[0]?.subscription_ids).toEqual([
		stripeSubscription.id,
	]);
	expect(subscriptions.data.map(({ id }) => id)).toEqual([
		stripeSubscription.id,
	]);
});

test(`${chalk.yellowBright("customers stripe sync: existing autumn customer is not imported on retry")}`, async () => {
	const customerId = `create-stripe-sync-existing-${runId}`;
	const pro = products.pro({
		id: `create-stripe-sync-existing-pro-${runId}`,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const { autumnV1, ctx } = await initScenario({
		setup: [s.deleteCustomer({ customerId }), s.products({ list: [pro] })],
		actions: [],
	});
	const stripeCustomer = await createStripeCustomer({ ctx, key: customerId });
	await createSubscription({
		ctx,
		stripeCustomerId: stripeCustomer.id,
		items: [{ price: await getBasePriceId({ ctx, productId: pro.id }) }],
	});
	await createAutumnCustomer({ autumnV1, customerId });

	const retried = await createAutumnCustomer({
		autumnV1,
		customerId,
		stripeCustomerId: stripeCustomer.id,
	});
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	expect(retried.stripe_id).toBeNull();
	expect(fullCustomer.customer_products).toHaveLength(0);
});

test(`${chalk.yellowBright("customers stripe sync: retries an incomplete initial import")}`, async () => {
	const customerId = `create-stripe-sync-resume-${runId}`;
	const pro = products.pro({
		id: `create-stripe-sync-resume-pro-${runId}`,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const { autumnV1, ctx } = await initScenario({
		setup: [s.deleteCustomer({ customerId }), s.products({ list: [pro] })],
		actions: [],
	});
	const stripeCustomer = await createStripeCustomer({ ctx, key: customerId });
	const stripeSubscription = await createSubscription({
		ctx,
		stripeCustomerId: stripeCustomer.id,
		items: [{ price: await getBasePriceId({ ctx, productId: pro.id }) }],
	});

	await expect(
		autumnV1.customers.create({
			id: customerId,
			stripe_id: stripeCustomer.id,
			currency: "eur",
			internalOptions: { disable_defaults: true },
		} as never),
	).rejects.toThrow();
	await autumnV1.customers.update(customerId, { currency: "usd" } as never);

	await createAutumnCustomer({
		autumnV1,
		customerId,
		stripeCustomerId: stripeCustomer.id,
	});
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	expect(fullCustomer.customer_products).toHaveLength(1);
	expect(fullCustomer.customer_products[0]?.subscription_ids).toEqual([
		stripeSubscription.id,
	]);
});

test(`${chalk.yellowBright("customers stripe sync: same-group subscriptions never remain active twice")}`, async () => {
	const customerId = `create-stripe-sync-same-group-${runId}`;
	const group = `create-stripe-sync-same-group-plans-${runId}`;
	const firstPlan = products.pro({
		id: `create-stripe-sync-same-group-first-${runId}`,
		group,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const secondPlan = products.pro({
		id: `create-stripe-sync-same-group-second-${runId}`,
		group,
		items: [items.monthlyMessages({ includedUsage: 200 })],
	});
	const { autumnV1, ctx } = await initScenario({
		setup: [
			s.deleteCustomer({ customerId }),
			s.products({ list: [firstPlan, secondPlan] }),
		],
		actions: [],
	});
	const stripeCustomer = await createStripeCustomer({ ctx, key: customerId });
	const subscriptions = await Promise.all(
		[firstPlan, secondPlan].map(async (product) =>
			createSubscription({
				ctx,
				stripeCustomerId: stripeCustomer.id,
				items: [
					{ price: await getBasePriceId({ ctx, productId: product.id }) },
				],
			}),
		),
	);

	await createAutumnCustomer({
		autumnV1,
		customerId,
		stripeCustomerId: stripeCustomer.id,
	});
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	expect(fullCustomer.customer_products).toHaveLength(1);
	expect(fullCustomer.customer_products[0]?.status).toBe(
		CusProductStatus.Active,
	);
	expect(subscriptions.map(({ id }) => id)).toContain(
		fullCustomer.customer_products[0]?.subscription_ids?.[0] ?? "",
	);
});

test(`${chalk.yellowBright("customers stripe sync: imports once across sequential and concurrent retries")}`, async () => {
	const customerId = `create-stripe-sync-basic-${runId}`;
	const pro = products.pro({
		id: `create-stripe-sync-pro-${runId}`,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const { autumnV1, ctx } = await initScenario({
		setup: [s.deleteCustomer({ customerId }), s.products({ list: [pro] })],
		actions: [],
	});
	const stripeCustomer = await createStripeCustomer({ ctx, key: customerId });
	const stripeSubscription = await createSubscription({
		ctx,
		stripeCustomerId: stripeCustomer.id,
		items: [{ price: await getBasePriceId({ ctx, productId: pro.id }) }],
	});
	const stripeBefore = await ctx.stripeCli.subscriptions.list({
		customer: stripeCustomer.id,
		status: "all",
	});

	const concurrentCreates = await Promise.all(
		Array.from({ length: 10 }, () =>
			createAutumnCustomer({
				autumnV1,
				customerId,
				stripeCustomerId: stripeCustomer.id,
			}),
		),
	);
	const created = concurrentCreates[0]!;
	expect(created.stripe_id).toBe(stripeCustomer.id);

	for (let index = 0; index < 3; index++) {
		await createAutumnCustomer({
			autumnV1,
			customerId,
			stripeCustomerId: stripeCustomer.id,
		});
	}
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		withSubs: true,
	});
	const apiCustomer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer: apiCustomer, productId: pro.id });
	expectCustomerFeatureCorrect({
		customer: apiCustomer,
		featureId: TestFeature.Messages,
		balance: 100,
		usage: 0,
	});
	expect(fullCustomer.customer_products).toHaveLength(1);
	expect(fullCustomer.customer_products[0]?.subscription_ids).toEqual([
		stripeSubscription.id,
	]);
	const stripeAfter = await ctx.stripeCli.subscriptions.list({
		customer: stripeCustomer.id,
		status: "all",
	});
	expect(stripeAfter.data.map(({ id }) => id)).toEqual(
		stripeBefore.data.map(({ id }) => id),
	);
});

test(`${chalk.yellowBright("customers stripe sync: imports eligible subscriptions and skips an unknown price")}`, async () => {
	const customerId = `create-stripe-sync-mixed-${runId}`;
	const pro = products.pro({
		id: `create-stripe-sync-main-${runId}`,
		group: `create-stripe-sync-main-group-${runId}`,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const addon = products.recurringAddOn({
		id: `create-stripe-sync-addon-${runId}`,
		items: [items.monthlyWords({ includedUsage: 25 })],
	});
	const { autumnV1, ctx } = await initScenario({
		setup: [
			s.deleteCustomer({ customerId }),
			s.products({ list: [pro, addon] }),
		],
		actions: [],
	});
	const stripeCustomer = await createStripeCustomer({ ctx, key: customerId });
	const [proSubscription, addonSubscription] = await Promise.all([
		createSubscription({
			ctx,
			stripeCustomerId: stripeCustomer.id,
			items: [{ price: await getBasePriceId({ ctx, productId: pro.id }) }],
		}),
		createSubscription({
			ctx,
			stripeCustomerId: stripeCustomer.id,
			items: [{ price: await getBasePriceId({ ctx, productId: addon.id }) }],
		}),
	]);
	const unknownProduct = await ctx.stripeCli.products.create({
		name: `Unknown ${runId}`,
	});
	const unknownPrice = await ctx.stripeCli.prices.create({
		product: unknownProduct.id,
		currency: "usd",
		unit_amount: 4200,
		recurring: { interval: "month" },
	});
	await createSubscription({
		ctx,
		stripeCustomerId: stripeCustomer.id,
		items: [{ price: unknownPrice.id }],
	});

	await createAutumnCustomer({
		autumnV1,
		customerId,
		stripeCustomerId: stripeCustomer.id,
	});
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	expect(fullCustomer.customer_products).toHaveLength(2);
	expect(
		fullCustomer.customer_products.map((product) => product.product_id).sort(),
	).toEqual([addon.id, pro.id].sort());
	expect(
		fullCustomer.customer_products.flatMap(
			(product) => product.subscription_ids ?? [],
		),
	).toEqual(expect.arrayContaining([proSubscription.id, addonSubscription.id]));
});

test(`${chalk.yellowBright("customers stripe sync: imports active subscription schedule phases")}`, async () => {
	const customerId = `create-stripe-sync-schedule-${runId}`;
	const pro = products.pro({
		id: `create-stripe-sync-schedule-pro-${runId}`,
		items: [],
	});
	const premium = products.premium({
		id: `create-stripe-sync-schedule-premium-${runId}`,
		items: [],
	});
	const { autumnV1, ctx } = await initScenario({
		setup: [
			s.deleteCustomer({ customerId }),
			s.products({ list: [pro, premium] }),
		],
		actions: [],
	});
	const stripeCustomer = await createStripeCustomer({ ctx, key: customerId });
	const stripeSchedule = await ctx.stripeCli.subscriptionSchedules.create({
		customer: stripeCustomer.id,
		start_date: "now",
		end_behavior: "release",
		phases: [
			{
				items: [{ price: await getBasePriceId({ ctx, productId: pro.id }) }],
				duration: { interval: "month", interval_count: 1 },
			},
			{
				items: [
					{ price: await getBasePriceId({ ctx, productId: premium.id }) },
				],
				duration: { interval: "month", interval_count: 1 },
			},
		],
	});

	await createAutumnCustomer({
		autumnV1,
		customerId,
		stripeCustomerId: stripeCustomer.id,
	});
	await expectCustomerProductStatuses({
		ctx,
		customerId,
		productId: pro.id,
		expected: { [CusProductStatus.Active]: 1 },
	});
	await expectCustomerProductStatuses({
		ctx,
		customerId,
		productId: premium.id,
		expected: { [CusProductStatus.Scheduled]: 1 },
	});
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const active = fullCustomer.customer_products.find(
		(product) => product.product_id === pro.id,
	);
	const scheduled = fullCustomer.customer_products.find(
		(product) => product.product_id === premium.id,
	);
	expect(active?.scheduled_ids ?? []).toEqual([]);
	expect(scheduled?.scheduled_ids).toEqual([stripeSchedule.id]);
	expect(active?.subscription_ids).toEqual(scheduled?.subscription_ids);
});

test(`${chalk.yellowBright("customers stripe sync: Mobbin-style 3x license quantity stays exact")}`, async () => {
	const customerId = `create-stripe-sync-license-${runId}`;
	const parent = products.base({
		id: `create-stripe-sync-team-${runId}`,
		items: [items.dashboard()],
	});
	const seat = products.base({
		id: `create-stripe-sync-team-seat-${runId}`,
		items: [items.monthlyPrice({ price: 20 })],
		group: `create-stripe-sync-seat-group-${runId}`,
	});
	const { autumnV1, autumnV2_3, ctx } = await initScenario({
		setup: [
			s.deleteCustomer({ customerId }),
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
	const stripeCustomer = await createStripeCustomer({ ctx, key: customerId });
	const stripeSubscription = await createSubscription({
		ctx,
		stripeCustomerId: stripeCustomer.id,
		items: [
			{
				price: await getBasePriceId({ ctx, productId: seat.id }),
				quantity: 3,
			},
		],
	});

	await createAutumnCustomer({
		autumnV1,
		customerId,
		stripeCustomerId: stripeCustomer.id,
	});
	await createAutumnCustomer({
		autumnV1,
		customerId,
		stripeCustomerId: stripeCustomer.id,
	});
	const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
	expectCustomerLicenses({
		customer,
		count: 1,
		licenses: [
			{
				license_plan_id: seat.id,
				parent_plan_id: parent.id,
				paid_quantity: 3,
				granted: 3,
				usage: 0,
				remaining: 3,
			},
		],
	});
	const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer: customerV3, productId: parent.id });
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	expect(fullCustomer.customer_products).toHaveLength(1);
	expect(fullCustomer.customer_products[0]?.subscription_ids).toEqual([
		stripeSubscription.id,
	]);
});
