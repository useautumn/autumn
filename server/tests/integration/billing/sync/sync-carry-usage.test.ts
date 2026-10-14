import { expect, test } from "bun:test";
import {
	CusProductStatus,
	type FullCusProduct,
	type SyncParamsV1,
	type SyncPhase,
	type SyncProposalV2,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { EntityService } from "@/internal/api/entities/EntityService";
import { CusService } from "@/internal/customers/CusService";

const MESSAGES = TestFeature.Messages;

const messagesBalance = (cusProduct: FullCusProduct): number | undefined =>
	cusProduct.customer_entitlements.find(
		(ce) => ce.entitlement?.feature?.id === MESSAGES,
	)?.balance ?? undefined;

const getActiveProducts = async ({
	customerId,
	productId,
}: {
	customerId: string;
	productId: string;
}): Promise<FullCusProduct[]> => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	return fullCustomer.customer_products.filter(
		(cp) =>
			cp.product_id === productId && cp.status === CusProductStatus.Active,
	);
};

const dashboardSync = async ({
	autumnV1,
	customerId,
	stripeSubscriptionId,
	carryOverUsage,
}: {
	// biome-ignore lint/suspicious/noExplicitAny: test client
	autumnV1: any;
	customerId: string;
	stripeSubscriptionId: string;
	carryOverUsage?: boolean;
	// biome-ignore lint/suspicious/noExplicitAny: sync result
}): Promise<any> => {
	const proposalsResponse = await autumnV1.post("/billing.sync_proposals_v2", {
		customer_id: customerId,
	});
	const proposal = (proposalsResponse.proposals as SyncProposalV2[]).find(
		(p) => p.stripe_subscription_id === stripeSubscriptionId,
	);
	if (!proposal) {
		throw new Error(`No sync proposal found for ${stripeSubscriptionId}`);
	}

	const phases: SyncPhase[] = proposal.phases
		.map((phase) => ({
			starts_at: phase.starts_at,
			plans: phase.plans.map((plan) => ({ ...plan, expire_previous: true })),
		}))
		.filter((phase) => phase.plans.length > 0);

	return autumnV1.post("/billing.sync_v2", {
		customer_id: customerId,
		stripe_subscription_id: proposal.stripe_subscription_id,
		stripe_schedule_id: proposal.stripe_schedule_id,
		phases,
		carry_over_usage: carryOverUsage,
	} satisfies SyncParamsV1);
};

test(
	chalk.yellowBright(
		"sync-v2 carry-usage: customer-level Free 5/10 → Pro carries to 15/20",
	),
	async () => {
		const customerId = "sync-carry-customer";
		const group = `grp-${customerId}`;

		const free = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 10 })],
			group,
			isDefault: true,
		});
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 20 })],
			group,
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro] }),
			],
			actions: [
				s.attach({ productId: free.id }),
				s.attach({ productId: pro.id }),
			],
		});

		const afterUpgrade = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const proStripeSubId = afterUpgrade.customer_products.find(
			(cp) => cp.product_id === pro.id,
		)?.subscription_ids?.[0];
		if (!proStripeSubId) throw new Error("missing Pro Stripe subscription id");

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: pro.id,
			cancel_action: "cancel_immediately",
			no_billing_changes: true,
		});
		await autumnV1.track({
			customer_id: customerId,
			feature_id: MESSAGES,
			value: 5,
		});
		await new Promise((r) => setTimeout(r, 2000));

		const result = await dashboardSync({
			autumnV1,
			customerId,
			stripeSubscriptionId: proStripeSubId,
		});

		expect(result.expired_cus_product_ids.length).toBe(1);

		const activeFree = await getActiveProducts({
			customerId,
			productId: free.id,
		});
		expect(activeFree.length).toBe(0);

		const activePro = await getActiveProducts({
			customerId,
			productId: pro.id,
		});
		expect(activePro.length).toBe(1);
		expect(messagesBalance(activePro[0])).toBe(15);
	},
);

test(
	chalk.yellowBright(
		"sync-v2 carry-usage: carry_over_usage=false leaves Pro at a fresh 20/20",
	),
	async () => {
		const customerId = "sync-carry-disabled";
		const group = `grp-${customerId}`;

		const free = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 10 })],
			group,
			isDefault: true,
		});
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 20 })],
			group,
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro] }),
			],
			actions: [
				s.attach({ productId: free.id }),
				s.attach({ productId: pro.id }),
			],
		});

		const afterUpgrade = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const proStripeSubId = afterUpgrade.customer_products.find(
			(cp) => cp.product_id === pro.id,
		)?.subscription_ids?.[0];
		if (!proStripeSubId) throw new Error("missing Pro Stripe subscription id");

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: pro.id,
			cancel_action: "cancel_immediately",
			no_billing_changes: true,
		});
		await autumnV1.track({
			customer_id: customerId,
			feature_id: MESSAGES,
			value: 5,
		});
		await new Promise((r) => setTimeout(r, 2000));

		await dashboardSync({
			autumnV1,
			customerId,
			stripeSubscriptionId: proStripeSubId,
			carryOverUsage: false,
		});

		const activePro = await getActiveProducts({
			customerId,
			productId: pro.id,
		});
		expect(activePro.length).toBe(1);
		expect(messagesBalance(activePro[0])).toBe(20);
	},
);

test(
	chalk.yellowBright(
		"sync-v2 carry-usage: entity-scoped Premium re-syncs on Entity A, no duplicate, carries to 21/30",
	),
	async () => {
		const customerId = "sync-carry-entity";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 20 })],
		});
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 30 })],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.attach({ productId: premium.id, entityIndex: 0 }),
			],
		});

		const afterSetup = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const entityList = await EntityService.list({
			db: ctx.db,
			internalCustomerId: afterSetup.internal_id,
		});
		const entityA = entityList[0];
		const proStripeSubId = afterSetup.customer_products.find(
			(cp) => cp.product_id === pro.id,
		)?.subscription_ids?.[0];
		if (!proStripeSubId) throw new Error("missing Stripe subscription id");

		await autumnV1.track({
			customer_id: customerId,
			entity_id: entityA.id ?? undefined,
			feature_id: MESSAGES,
			value: 9,
		});
		await new Promise((r) => setTimeout(r, 2000));

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: pro.id,
			cancel_action: "cancel_immediately",
			no_billing_changes: true,
		});

		await dashboardSync({
			autumnV1,
			customerId,
			stripeSubscriptionId: proStripeSubId,
		});

		const activePremium = await getActiveProducts({
			customerId,
			productId: premium.id,
		});
		expect(activePremium.length).toBe(1);
		expect(activePremium[0].internal_entity_id).toBe(entityA.internal_id);
		expect(messagesBalance(activePremium[0])).toBe(21);

		const activePro = await getActiveProducts({
			customerId,
			productId: pro.id,
		});
		expect(activePro.length).toBe(1);
		expect(activePro[0].internal_entity_id ?? null).toBeNull();
	},
);
