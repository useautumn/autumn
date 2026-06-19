/**
 * Regression: carry-over for PREPAID features across two entities
 * (default_applies_to_entities = true).
 *
 * Two entities X and Y both on Pro (prepaid 5000 credits each) on one Stripe
 * sub. Delink X (cancel no_billing → Free auto-reattaches on X). Use 500 on Y
 * and 40 on X, then sync both entities back to Pro (the dashboard submits a
 * rolled-up qty-2 plan on Y plus an operator-added qty-1 plan on X), expire +
 * carry on.
 *
 * Prepaid stores its included amount in the prepaid quantity, not
 * entitlement.allowance — so the carry must use real usage:
 *   Y stays Pro 4500/5000 (500 carried), X returns to Pro 4960/5000 (40 carried).
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import {
	CusProductStatus,
	type FullCusProduct,
	type SyncParamsV1,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { db } from "@/db/initDrizzle";
import { EntityService } from "@/internal/api/entities/EntityService";
import { CusService } from "@/internal/customers/CusService";
import { OrgService } from "@/internal/orgs/OrgService";

const MESSAGES = TestFeature.Messages;

beforeAll(async () => {
	await OrgService.update({
		db,
		orgId: ctx.org.id,
		updates: {
			config: { ...ctx.org.config, default_applies_to_entities: true },
		},
	});
});

afterAll(async () => {
	await OrgService.update({
		db,
		orgId: ctx.org.id,
		updates: {
			config: { ...ctx.org.config, default_applies_to_entities: false },
		},
	});
});

const activeProductsOnEntity = async ({
	customerId,
	productId,
	internalEntityId,
}: {
	customerId: string;
	productId: string;
	internalEntityId: string;
}): Promise<FullCusProduct[]> => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	return fullCustomer.customer_products.filter(
		(cp) =>
			cp.product_id === productId &&
			cp.status === CusProductStatus.Active &&
			cp.internal_entity_id === internalEntityId,
	);
};

const messagesBalance = (cusProduct: FullCusProduct): number | undefined =>
	cusProduct.customer_entitlements.find(
		(ce) => ce.entitlement?.feature?.id === MESSAGES,
	)?.balance ?? undefined;

test(
	chalk.yellowBright(
		"sync-v2 carry-usage: prepaid credits across two entities (delink X, resync both)",
	),
	async () => {
		const customerId = "sync-carry-prepaid-entities";

		const free = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 50 })],
			isDefault: true,
		});
		const pro = products.pro({
			id: "pro",
			items: [
				items.prepaidMessages({ includedUsage: 0, billingUnits: 1, price: 1 }),
			],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro] }),
				s.entities({
					count: 2,
					featureId: TestFeature.Users,
					defaultGroup: customerId,
				}),
			],
			actions: [
				s.attach({
					productId: pro.id,
					entityIndex: 0,
					options: [{ feature_id: MESSAGES, quantity: 5000 }],
				}),
				s.attach({
					productId: pro.id,
					entityIndex: 1,
					options: [{ feature_id: MESSAGES, quantity: 5000 }],
				}),
			],
		});

		const full = await CusService.getFull({ ctx, idOrInternalId: customerId });
		const entityList = await EntityService.list({
			db: ctx.db,
			internalCustomerId: full.internal_id,
		});
		const entityX = entityList[0];
		const entityY = entityList[1];
		const proSubId = full.customer_products.find(
			(cp) => cp.product_id === pro.id,
		)?.subscription_ids?.[0];
		if (!proSubId) throw new Error("no Pro sub id");

		// Delink X → Free auto-reattaches on X.
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: pro.id,
			entity_id: entityX.id ?? undefined,
			cancel_action: "cancel_immediately",
			no_billing_changes: true,
		});
		await new Promise((r) => setTimeout(r, 1500));

		// Use 500 on Y (Pro) and 40 on X (Free).
		await autumnV1.track({
			customer_id: customerId,
			entity_id: entityY.id ?? undefined,
			feature_id: MESSAGES,
			value: 500,
		});
		await autumnV1.track({
			customer_id: customerId,
			entity_id: entityX.id ?? undefined,
			feature_id: MESSAGES,
			value: 40,
		});
		await new Promise((r) => setTimeout(r, 2000));

		// Mirror the dashboard submission: rolled-up qty-2 plan stamped to Y +
		// operator-added qty-1 plan on X. Expire + carry default on.
		await autumnV1.post("/billing.sync_v2", {
			customer_id: customerId,
			stripe_subscription_id: proSubId,
			phases: [
				{
					starts_at: "now",
					plans: [
						{
							plan_id: pro.id,
							quantity: 2,
							entity_id: entityY.id ?? undefined,
							expire_previous: true,
							feature_quantities: [{ feature_id: MESSAGES, quantity: 5000 }],
						},
						{
							plan_id: pro.id,
							quantity: 1,
							entity_id: entityX.id ?? undefined,
							expire_previous: true,
							feature_quantities: [{ feature_id: MESSAGES, quantity: 5000 }],
						},
					],
				},
			],
		} satisfies SyncParamsV1);

		// Y: single active Pro, 500 carried → 4500.
		const proY = await activeProductsOnEntity({
			customerId,
			productId: pro.id,
			internalEntityId: entityY.internal_id,
		});
		expect(proY.length).toBe(1);
		expect(messagesBalance(proY[0])).toBe(4500);

		// X: single active Pro, 40 carried from Free → 4960.
		const proX = await activeProductsOnEntity({
			customerId,
			productId: pro.id,
			internalEntityId: entityX.internal_id,
		});
		expect(proX.length).toBe(1);
		expect(messagesBalance(proX[0])).toBe(4960);

		// Free expired off X.
		const fullAfter = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const activeFree = fullAfter.customer_products.filter(
			(cp) =>
				cp.product_id === free.id && cp.status === CusProductStatus.Active,
		);
		expect(activeFree.length).toBe(0);
	},
);
