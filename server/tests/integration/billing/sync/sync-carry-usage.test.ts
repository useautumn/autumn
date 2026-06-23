/**
 * Regression coverage for syncV2 expire behaviour:
 *   - entity-scoped re-sync re-attaches on the same entity (no customer-level
 *     duplicate) and expires the existing entity-scoped product
 *   - consumed usage carries from the expired plan onto the replacement
 *     (carry_over_usage, default on) — and stays put when turned off
 *
 * Out-of-sync state is forced with `cancel_immediately` + `no_billing_changes`
 * (cancels in Autumn, leaves the live Stripe subscription), then re-synced the
 * way the dashboard does it (detection proposals → submit with expire on).
 */

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

// Submit a sync the same way the dashboard does: detection proposal → expire on.
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

// ═══════════════════════════════════════════════════════════════════════════
// Customer-level: Free (5/10 used) → re-sync Pro with expire → Pro 15/20.
// ═══════════════════════════════════════════════════════════════════════════

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

		// Out of sync: cancel Pro in Autumn only; fall back to default Free.
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: pro.id,
			cancel_action: "cancel_immediately",
			no_billing_changes: true,
		});
		// Use 5 on the reactivated Free → 5/10.
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

		// Free expired, exactly one active Pro carrying the 5 used → 15/20.
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

// ═══════════════════════════════════════════════════════════════════════════
// Escape hatch: same flow with carry_over_usage:false → Pro stays 20/20.
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// Entity-scoped: Premium on Entity A (21/30 used). Re-sync re-attaches on
// Entity A (no customer-level duplicate), expires the old one, carries usage.
// ═══════════════════════════════════════════════════════════════════════════

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

		// Use 9 on Premium@Entity A → 21/30.
		await autumnV1.track({
			customer_id: customerId,
			entity_id: entityA.id ?? undefined,
			feature_id: MESSAGES,
			value: 9,
		});
		await new Promise((r) => setTimeout(r, 2000));

		// Out of sync: cancel only Pro (customer); Premium@Entity A stays.
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

		// Exactly one active Premium, bound to Entity A, carrying 9 used → 21/30.
		const activePremium = await getActiveProducts({
			customerId,
			productId: premium.id,
		});
		expect(activePremium.length).toBe(1);
		expect(activePremium[0].internal_entity_id).toBe(entityA.internal_id);
		expect(messagesBalance(activePremium[0])).toBe(21);

		// Pro re-attached at the customer level (fresh).
		const activePro = await getActiveProducts({
			customerId,
			productId: pro.id,
		});
		expect(activePro.length).toBe(1);
		expect(activePro[0].internal_entity_id ?? null).toBeNull();
	},
);
