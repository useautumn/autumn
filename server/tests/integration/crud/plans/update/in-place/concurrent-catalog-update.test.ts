// Concurrent item updates must reload the catalog state protected by the product lock.
// Otherwise, both stale callers insert a replacement and leave duplicate active rows.

import { expect, test } from "bun:test";
import { entitlements } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import { updateProductItems } from "@/internal/product/actions/updateProduct/updateProductItems.js";
import { ProductService } from "@/internal/products/ProductService.js";

test.concurrent(
	`${chalk.yellowBright("updateProductItems: concurrent replacements leave one active row")}`,
	async () => {
		const suffix = Math.random().toString(36).slice(2, 9);
		const plan = products.base({
			id: `catalog_concurrent_update_${suffix}`,
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx } = await initScenario({
			setup: [
				s.products({ list: [plan], prefix: suffix, createInStripe: false }),
			],
			actions: [],
		});

		const productBeforeUpdates = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: plan.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		const messagesEntitlement = productBeforeUpdates.entitlements.find(
			(entitlement) => entitlement.feature?.id === TestFeature.Messages,
		);
		expect(messagesEntitlement).toBeDefined();

		let markLockAcquired = () => {};
		const lockAcquired = new Promise<void>((resolve) => {
			markLockAcquired = resolve;
		});
		let releaseEntitlementLock = () => {};
		const holdEntitlementLock = new Promise<void>((resolve) => {
			releaseEntitlementLock = resolve;
		});
		const lockingTransaction = ctx.db.transaction(async (transaction) => {
			await transaction
				.select({ id: entitlements.id })
				.from(entitlements)
				.where(eq(entitlements.id, messagesEntitlement!.id))
				.for("update");
			markLockAcquired();
			await holdEntitlementLock;
		});
		await Promise.race([lockAcquired, lockingTransaction]);

		const catalogUpdates = Promise.allSettled([
			updateProductItems({
				ctx,
				db: ctx.db,
				fullProduct: structuredClone(productBeforeUpdates),
				newItems: [items.monthlyMessages({ includedUsage: 200 })],
				features: ctx.features,
				useInPlaceEdit: false,
			}),
			updateProductItems({
				ctx,
				db: ctx.db,
				fullProduct: structuredClone(productBeforeUpdates),
				newItems: [items.monthlyMessages({ includedUsage: 300 })],
				features: ctx.features,
				useInPlaceEdit: false,
			}),
		]);

		try {
			await timeout(250);
		} finally {
			releaseEntitlementLock();
		}
		await lockingTransaction;
		const catalogUpdateResults = await catalogUpdates;
		const rejectedUpdate = catalogUpdateResults.find(
			(result) => result.status === "rejected",
		);
		if (rejectedUpdate) throw rejectedUpdate.reason;

		const activeMessagesEntitlements = await ctx.db
			.select({
				id: entitlements.id,
				allowance: entitlements.allowance,
			})
			.from(entitlements)
			.where(
				and(
					eq(
						entitlements.internal_product_id,
						productBeforeUpdates.internal_id,
					),
					eq(
						entitlements.internal_feature_id,
						messagesEntitlement!.internal_feature_id,
					),
					eq(entitlements.is_custom, false),
				),
			);

		expect(activeMessagesEntitlements).toHaveLength(1);
		expect([200, 300]).toContain(activeMessagesEntitlements[0]!.allowance!);
	},
);
