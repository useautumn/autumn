/**
 * customers.get_or_create with `stripe_id` on a customer that already exists.
 * Mobbin creates the Autumn customer first and the Stripe customer later, then sends the new
 * `stripe_id` on get_or_create before checkout.
 *
 * Red (before):  an existing customer ignored `stripe_id` (response `stripe_id: null`), so
 *                Stripe webhooks for the later subscription found no customer and were dropped.
 * Green (after): an unlinked customer is linked to the `stripe_id` it is sent and imports that
 *                Stripe customer's subscriptions, as creation does; a customer already linked to
 *                another Stripe customer keeps its link.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import {
	createStripeSubscriptionFromProduct,
	getFirstStripePriceId,
} from "@tests/integration/billing/sync/utils/syncTestUtils";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type { AutumnInt } from "@/external/autumn/autumnCli";
import { CusService } from "@/internal/customers/CusService";
import { ProductService } from "@/internal/products/ProductService";
import { attachPaymentMethod } from "@/utils/scriptUtils/initCustomer";

const createStripeCustomer = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) => {
	const stripeCustomer = await ctx.stripeCli.customers.create({
		email: `${customerId}@example.com`,
		metadata: { workspaceId: customerId },
	});
	await attachPaymentMethod({
		stripeCli: ctx.stripeCli,
		stripeCusId: stripeCustomer.id,
		type: "success",
	});
	return stripeCustomer;
};

const getOrCreateCustomer = ({
	autumn,
	customerId,
	stripeId,
}: {
	autumn: AutumnInt;
	customerId: string;
	stripeId?: string;
}) =>
	autumn.post("/customers.get_or_create", {
		customer_id: customerId,
		email: `${customerId}@example.com`,
		stripe_id: stripeId,
	}) as Promise<ApiCustomerV5>;

const subscribeToProduct = async ({
	ctx,
	stripeCustomerId,
	productId,
}: {
	ctx: TestContext;
	stripeCustomerId: string;
	productId: string;
}) => {
	const fullProduct = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: productId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	return ctx.stripeCli.subscriptions.create({
		customer: stripeCustomerId,
		items: [{ price: getFirstStripePriceId({ fullProduct }) }],
	});
};

const getSubscriptionIds = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	return fullCustomer.customer_products.flatMap(
		(customerProduct) => customerProduct.subscription_ids ?? [],
	);
};

test.concurrent(
	`${chalk.yellowBright("get_or_create stripe link: existing customer is linked, then its checkout subscription syncs")}`,
	async () => {
		const customerId = "goc-stripe-link-later-sub";
		const pro = products.pro({
			id: "goc-stripe-link-later-sub-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_3, ctx } = await initScenario({
			setup: [s.deleteCustomer({ customerId }), s.products({ list: [pro] })],
			actions: [],
		});
		await getOrCreateCustomer({ autumn: autumnV2_3, customerId });
		const stripeCustomer = await createStripeCustomer({ ctx, customerId });

		const linked = await getOrCreateCustomer({
			autumn: autumnV2_3,
			customerId,
			stripeId: stripeCustomer.id,
		});
		expect(linked.stripe_id).toBe(stripeCustomer.id);

		const subscription = await createStripeSubscriptionFromProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		await expectCustomerProducts({
			autumn: autumnV2_3,
			customerId,
			active: [pro.id],
		});
		expect(await getSubscriptionIds({ ctx, customerId })).toEqual([
			subscription.id,
		]);
	},
);

test.concurrent(
	`${chalk.yellowBright("get_or_create stripe link: linking an existing customer imports its Stripe subscription once")}`,
	async () => {
		const customerId = "goc-stripe-link-existing-sub";
		const pro = products.pro({
			id: "goc-stripe-link-existing-sub-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_3, ctx } = await initScenario({
			setup: [s.deleteCustomer({ customerId }), s.products({ list: [pro] })],
			actions: [],
		});
		await getOrCreateCustomer({ autumn: autumnV2_3, customerId });
		const stripeCustomer = await createStripeCustomer({ ctx, customerId });
		const subscription = await subscribeToProduct({
			ctx,
			stripeCustomerId: stripeCustomer.id,
			productId: pro.id,
		});

		const linked = await getOrCreateCustomer({
			autumn: autumnV2_3,
			customerId,
			stripeId: stripeCustomer.id,
		});
		await getOrCreateCustomer({
			autumn: autumnV2_3,
			customerId,
			stripeId: stripeCustomer.id,
		});

		expect(linked.stripe_id).toBe(stripeCustomer.id);
		expect(linked.subscriptions.map(({ plan_id }) => plan_id)).toContain(
			pro.id,
		);
		await expectCustomerProducts({
			autumn: autumnV2_3,
			customerId,
			active: [pro.id],
		});
		expect(await getSubscriptionIds({ ctx, customerId })).toEqual([
			subscription.id,
		]);
	},
);

test.concurrent(
	`${chalk.yellowBright("get_or_create stripe link: a customer linked to another Stripe customer keeps its link")}`,
	async () => {
		const customerId = "goc-stripe-link-conflict";
		const pro = products.pro({
			id: "goc-stripe-link-conflict-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_3, ctx } = await initScenario({
			setup: [s.deleteCustomer({ customerId }), s.products({ list: [pro] })],
			actions: [],
		});
		const original = await createStripeCustomer({ ctx, customerId });
		await getOrCreateCustomer({
			autumn: autumnV2_3,
			customerId,
			stripeId: original.id,
		});
		const other = await createStripeCustomer({ ctx, customerId });
		await subscribeToProduct({
			ctx,
			stripeCustomerId: other.id,
			productId: pro.id,
		});

		const result = await getOrCreateCustomer({
			autumn: autumnV2_3,
			customerId,
			stripeId: other.id,
		});

		expect(result.stripe_id).toBe(original.id);
		expect(await getSubscriptionIds({ ctx, customerId })).toEqual([]);
	},
);

test.concurrent(
	`${chalk.yellowBright("get_or_create stripe link: a Stripe customer already linked to another customer is not shared")}`,
	async () => {
		const customerId = "goc-stripe-link-owned";
		const otherCustomerId = "goc-stripe-link-owner";
		const { autumnV2_3, ctx } = await initScenario({
			setup: [
				s.deleteCustomer({ customerId }),
				s.deleteCustomer({ customerId: otherCustomerId }),
			],
			actions: [],
		});
		const stripeCustomer = await createStripeCustomer({
			ctx,
			customerId: otherCustomerId,
		});
		await getOrCreateCustomer({
			autumn: autumnV2_3,
			customerId: otherCustomerId,
			stripeId: stripeCustomer.id,
		});
		await getOrCreateCustomer({ autumn: autumnV2_3, customerId });

		const result = await getOrCreateCustomer({
			autumn: autumnV2_3,
			customerId,
			stripeId: stripeCustomer.id,
		});

		expect(result.stripe_id).toBeNull();
	},
);

test.concurrent(
	`${chalk.yellowBright("get_or_create stripe link: a failed Stripe read leaves the customer unlinked for a retry")}`,
	async () => {
		const customerId = "goc-stripe-link-failed-read";
		const { autumnV2_3, ctx } = await initScenario({
			setup: [s.deleteCustomer({ customerId })],
			actions: [],
		});
		await getOrCreateCustomer({ autumn: autumnV2_3, customerId });
		const stripeCustomer = await createStripeCustomer({ ctx, customerId });
		await ctx.stripeCli.customers.del(stripeCustomer.id);

		await expectAutumnError({
			errMessage: `No such customer: '${stripeCustomer.id}'`,
			func: () =>
				getOrCreateCustomer({
					autumn: autumnV2_3,
					customerId,
					stripeId: stripeCustomer.id,
				}),
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		expect(fullCustomer.processor?.id).toBeUndefined();
	},
);
