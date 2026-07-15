/**
 * TDD test for catalog updates when a customer product references an
 * entitlement from a newer plan version.
 *
 * Red-failure mode (current behavior):
 *  - catalog.update treats the newer version as customer-free, deletes its
 *    referenced entitlement, and hits the customer_entitlements FK.
 *
 * Green-success criteria (after fix):
 *  - catalog.update retires the referenced entitlement, preserves the
 *    customer row, and updates every plan version successfully.
 */

import { expect, test } from "bun:test";
import {
	customerEntitlements,
	entitlements,
	ResetInterval,
} from "@autumn/shared";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { CusService } from "@/internal/customers/CusService.js";
import { ProductService } from "@/internal/products/ProductService.js";

const messagesItem = (included: number) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval: ResetInterval.Month },
});

test.concurrent(
	`${chalk.yellowBright("catalog.update: preserves cross-version entitlement references")}`,
	async () => {
		const suffix = Math.random().toString(36).slice(2, 9);
		const customerId = `catalog-cross-version-ref-${suffix}`;
		const plan = products.pro({
			id: `catalog_cross_version_ref_${suffix}`,
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV1, autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [s.billing.attach({ productId: plan.id })],
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });

		// Create v2 while the customer remains attached to v1.
		await autumnV1.products.update(plan.id, {
			items: [items.monthlyMessages({ includedUsage: 200 })],
		});
		const latestBefore = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: plan.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		expect(latestBefore.version).toBe(2);
		const v2MessagesEntitlement = latestBefore.entitlements.find(
			(entitlement) => entitlement.feature?.id === TestFeature.Messages,
		);
		expect(v2MessagesEntitlement).toBeDefined();

		// Reproduce Popfly's script-created state: the v1 customer product points
		// at a catalog entitlement owned by v2, which has no direct customers.
		const customer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const customerProduct = customer.customer_products.find(
			(candidate) => candidate.product_id === plan.id,
		);
		const customerMessagesEntitlement =
			customerProduct?.customer_entitlements.find(
				(customerEntitlement) =>
					customerEntitlement.entitlement.feature_id === TestFeature.Messages,
			);
		expect(customerProduct?.product.version).toBe(1);
		expect(customerMessagesEntitlement).toBeDefined();
		await ctx.db
			.update(customerEntitlements)
			.set({ entitlement_id: v2MessagesEntitlement!.id })
			.where(eq(customerEntitlements.id, customerMessagesEntitlement!.id));

		await autumnV2_3.catalog.update({
			features: [],
			plans: [
				{
					plan_id: plan.id,
					items: [messagesItem(300)],
					all_versions: true,
				},
			],
			skip_deletions: true,
		});

		const latestAfter = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: plan.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		const newMessagesEntitlement = latestAfter.entitlements.find(
			(entitlement) => entitlement.feature?.id === TestFeature.Messages,
		);
		expect(newMessagesEntitlement).toMatchObject({
			allowance: 300,
			is_custom: false,
		});
		expect(newMessagesEntitlement?.id).not.toBe(v2MessagesEntitlement!.id);

		const [retiredEntitlement] = await ctx.db
			.select()
			.from(entitlements)
			.where(eq(entitlements.id, v2MessagesEntitlement!.id));
		expect(retiredEntitlement?.is_custom).toBe(true);

		const [preservedCustomerEntitlement] = await ctx.db
			.select()
			.from(customerEntitlements)
			.where(eq(customerEntitlements.id, customerMessagesEntitlement!.id));
		expect(preservedCustomerEntitlement?.entitlement_id).toBe(
			v2MessagesEntitlement!.id,
		);

		const versionOne = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: plan.id,
			orgId: ctx.org.id,
			env: ctx.env,
			version: 1,
		});
		expect(
			versionOne.entitlements.find(
				(entitlement) => entitlement.feature?.id === TestFeature.Messages,
			)?.allowance,
		).toBe(300);
	},
);
