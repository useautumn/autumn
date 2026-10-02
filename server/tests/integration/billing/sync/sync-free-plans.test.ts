/**
 * Sync treats free plans as customer-wide, the way the dashboard now seeds them:
 *   A. a free add-on repeated unchanged is kept: same row, still unlinked
 *   B. a free add-on left out of a full-list sync (expire_unlisted_plans) expires
 *   C. an edited free add-on is replaced by a row that stays off the subscription
 */
import { expect, test } from "bun:test";
import {
	CusProductStatus,
	type FullCusProduct,
	ResetInterval,
	type SyncParamsV1,
	type SyncPlanInstance,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";

const setupProWithFreeAddOn = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const bonus = products.base({
		id: "bonus",
		isAddOn: true,
		items: [items.monthlyWords({ includedUsage: 10 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, bonus] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.attach({ productId: bonus.id }),
		],
	});

	const before = await activeCustomerProducts({ customerId });
	const stripeSubscriptionId = before.find(
		(customerProduct) => customerProduct.product_id === pro.id,
	)?.subscription_ids?.[0];
	if (!stripeSubscriptionId) throw new Error("missing Pro subscription id");
	const bonusBefore = before.find(
		(customerProduct) => customerProduct.product_id === bonus.id,
	);
	if (!bonusBefore) throw new Error("missing free add-on");

	return { autumnV1, pro, bonus, stripeSubscriptionId, bonusBefore };
};

const activeCustomerProducts = async ({
	customerId,
}: {
	customerId: string;
}): Promise<FullCusProduct[]> => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	return fullCustomer.customer_products.filter(
		(customerProduct) => customerProduct.status === CusProductStatus.Active,
	);
};

const customerProductStatus = async ({
	customerId,
	customerProductId,
}: {
	customerId: string;
	customerProductId: string;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		inStatuses: [CusProductStatus.Active, CusProductStatus.Expired],
	});
	return fullCustomer.customer_products.find(
		(customerProduct) => customerProduct.id === customerProductId,
	)?.status;
};

const fullListSync = ({
	autumnV1,
	customerId,
	stripeSubscriptionId,
	plans,
}: {
	// biome-ignore lint/suspicious/noExplicitAny: AutumnInt test client
	autumnV1: any;
	customerId: string;
	stripeSubscriptionId: string;
	plans: SyncPlanInstance[];
}) =>
	autumnV1.post("/billing.sync_v2", {
		customer_id: customerId,
		stripe_subscription_id: stripeSubscriptionId,
		phases: [
			{
				starts_at: "now",
				plans: plans.map((plan) => ({ ...plan, expire_previous: true })),
			},
		],
		expire_unlisted_plans: true,
	} satisfies SyncParamsV1);

const summarize = (customerProducts: FullCusProduct[]) =>
	customerProducts
		.map((customerProduct) => ({
			productId: customerProduct.product_id,
			subscriptionIds: customerProduct.subscription_ids ?? [],
		}))
		.sort((a, b) => a.productId.localeCompare(b.productId));

test.concurrent(
	chalk.yellowBright("sync free plans: an unchanged free add-on is kept as is"),
	async () => {
		const customerId = "sync-free-unchanged";
		const { autumnV1, pro, bonus, stripeSubscriptionId, bonusBefore } =
			await setupProWithFreeAddOn({ customerId });

		await fullListSync({
			autumnV1,
			customerId,
			stripeSubscriptionId,
			plans: [{ plan_id: pro.id }, { plan_id: bonus.id }],
		});

		const after = await activeCustomerProducts({ customerId });
		expect(summarize(after)).toEqual([
			{ productId: bonus.id, subscriptionIds: [] },
			{ productId: pro.id, subscriptionIds: [stripeSubscriptionId] },
		]);
		expect(
			after.find((customerProduct) => customerProduct.product_id === bonus.id)
				?.id,
		).toBe(bonusBefore.id);
	},
);

test.concurrent(
	chalk.yellowBright(
		"sync free plans: a free add-on left out of a full-list sync expires",
	),
	async () => {
		const customerId = "sync-free-removed";
		const { autumnV1, pro, stripeSubscriptionId, bonusBefore } =
			await setupProWithFreeAddOn({ customerId });

		await fullListSync({
			autumnV1,
			customerId,
			stripeSubscriptionId,
			plans: [{ plan_id: pro.id }],
		});

		expect(summarize(await activeCustomerProducts({ customerId }))).toEqual([
			{ productId: pro.id, subscriptionIds: [stripeSubscriptionId] },
		]);
		expect(
			await customerProductStatus({
				customerId,
				customerProductId: bonusBefore.id,
			}),
		).toBe(CusProductStatus.Expired);
	},
);

test.concurrent(
	chalk.yellowBright(
		"sync free plans: an edited free add-on is replaced off the subscription",
	),
	async () => {
		const customerId = "sync-free-edited";
		const { autumnV1, pro, bonus, stripeSubscriptionId, bonusBefore } =
			await setupProWithFreeAddOn({ customerId });

		await fullListSync({
			autumnV1,
			customerId,
			stripeSubscriptionId,
			plans: [
				{ plan_id: pro.id },
				{
					plan_id: bonus.id,
					customize: {
						remove_items: [{ feature_id: TestFeature.Words }],
						add_items: [
							{
								feature_id: TestFeature.Words,
								included: 50,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				},
			],
		});

		const after = await activeCustomerProducts({ customerId });
		expect(summarize(after)).toEqual([
			{ productId: bonus.id, subscriptionIds: [] },
			{ productId: pro.id, subscriptionIds: [stripeSubscriptionId] },
		]);
		const bonusAfter = after.find(
			(customerProduct) => customerProduct.product_id === bonus.id,
		);
		expect(bonusAfter?.id).not.toBe(bonusBefore.id);
		expect(
			bonusAfter?.customer_entitlements.find(
				(customerEntitlement) =>
					customerEntitlement.entitlement.feature.id === TestFeature.Words,
			)?.entitlement.allowance,
		).toBe(50);
	},
);
