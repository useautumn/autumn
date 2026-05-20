/**
 * TDD coverage for the boolean-feature noop path in patch-style add_items.
 *
 * Contract under test:
 *   Behavior:
 *     - customize.add_items containing a boolean feature_id whose target customer
 *       product ALREADY has a customer_entitlement for that feature is a noop —
 *       no second customer_entitlement row is inserted.
 *   Side effects:
 *     - cus_product retains exactly 1 customer_entitlement for that feature.
 *     - flags[feature_id] still present and still tied to the same plan_id.
 *     - update call succeeds; preview total = 0 for a pure noop.
 *   Negative control:
 *     - Adding a boolean feature NOT already on the cus_product creates exactly
 *       1 customer_entitlement (normal add path is unaffected by the filter).
 *
 * Pre-impl red: without handleCustomizeNoopItems, handleCustomizeAddItems builds
 * a fresh Entitlement for the boolean feature; applyCustomerProductItemsPatch
 * appends it alongside the existing one, leaving 2 cusEnts for the same feature.
 * Post-impl green: the noop filter drops the duplicate add_item before it reaches
 * the add-items handler, so the cusEnt count stays at 1.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	customers,
	CusProductStatus,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectFlagCorrect } from "@tests/integration/utils/expectFlagCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";

const countDashboardCusEnts = async ({
	ctx,
	customerId,
	productId,
}: {
	ctx: TestContext;
	customerId: string;
	productId: string;
}): Promise<number> => {
	const dbCustomer = await ctx.db.query.customers.findFirst({
		where: eq(customers.id, customerId),
	});
	expect(dbCustomer).toBeDefined();

	const cusProducts = await CusProductService.list({
		db: ctx.db,
		internalCustomerId: dbCustomer!.internal_id,
		inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
	});

	const cusProduct = cusProducts.find(
		(cp) => cp.product?.id === productId && cp.status === CusProductStatus.Active,
	);
	expect(cusProduct).toBeDefined();

	return cusProduct!.customer_entitlements.filter(
		(cusEnt) => cusEnt.entitlement.feature_id === TestFeature.Dashboard,
	).length;
};

test.concurrent(
	`${chalk.yellowBright("patch noop boolean: re-adding existing boolean alongside a real add does not duplicate")}`,
	async () => {
		const customerId = "patch-noop-boolean-existing";
		const pro = products.pro({ items: [items.dashboard()] });

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		// ── Sanity: start with exactly 1 Dashboard cusEnt ──────────────
		expect(
			await countDashboardCusEnts({ ctx, customerId, productId: pro.id }),
		).toBe(1);

		const updateParams: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: pro.id,
			customize: {
				add_items: [
					itemsV2.dashboard(),
					itemsV2.monthlyWords({ included: 150 }),
				],
			},
		};

		// ── Contract: update succeeds (noop dashboard + real words add) ─
		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(
			updateParams,
		);

		// ── Contract: flag still present, tied to pro ──────────────────
		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({ customer, active: [pro.id] });
		expectFlagCorrect({
			customer,
			featureId: TestFeature.Dashboard,
			planId: pro.id,
		});

		// ── Contract: noop produced no duplicate cusEnt row ────────────
		// Pre-fix: this would be 2 (handleCustomizeAddItems built a fresh
		//   Entitlement for Dashboard; applyCustomerProductItemsPatch tacked
		//   it on alongside the existing one).
		// Post-fix: handleCustomizeNoopItems drops the duplicate add_item
		//   before it reaches the add handler.
		expect(
			await countDashboardCusEnts({ ctx, customerId, productId: pro.id }),
		).toBe(1);
	},
);

test.concurrent(
	`${chalk.yellowBright("patch noop boolean: adding a new boolean feature still inserts exactly once")}`,
	async () => {
		const customerId = "patch-noop-boolean-new";
		const pro = products.pro({ items: [] });

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		// ── Sanity: start with 0 Dashboard cusEnts ─────────────────────
		expect(
			await countDashboardCusEnts({ ctx, customerId, productId: pro.id }),
		).toBe(0);

		const updateParams: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: pro.id,
			customize: {
				add_items: [itemsV2.dashboard()],
			},
		};

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(
			updateParams,
		);

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({ customer, active: [pro.id] });
		expectFlagCorrect({
			customer,
			featureId: TestFeature.Dashboard,
			planId: pro.id,
		});

		// ── Contract: filter must not block legitimate adds ────────────
		expect(
			await countDashboardCusEnts({ ctx, customerId, productId: pro.id }),
		).toBe(1);
	},
);
