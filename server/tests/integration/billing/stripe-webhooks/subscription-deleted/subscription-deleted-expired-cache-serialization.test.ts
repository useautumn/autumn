/** Red: lazy reset makes the subscription.deleted expired-product cache payload cyclic.
 * Green: reset preserves serializable product snapshots and the cache write succeeds. */

import { expect, test } from "bun:test";
import {
	customerEntitlements,
	findActiveCustomerProductById,
	findCustomerEntitlementByFeature,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { CusService } from "@/internal/customers/CusService.js";
import { customerProductActions } from "@/internal/customers/cusProducts/actions/index.js";

test(`${chalk.yellowBright("sub.deleted: lazy reset keeps expired product cache serializable")}`, async () => {
	const customerId = "sub-deleted-reset-cache-serialization";
	const product = products.pro({
		id: "sub-deleted-reset-cache-product",
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.consumableWords(),
		],
	});
	const { ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [s.attach({ productId: product.id })],
	});

	const beforeReset = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		skipReset: true,
	});
	const customerProductBeforeReset = findActiveCustomerProductById({
		fullCus: beforeReset,
		productId: product.id,
	});
	if (!customerProductBeforeReset)
		throw new Error("Expected the attached customer product before reset");
	const customerEntitlement = findCustomerEntitlementByFeature({
		cusEnts: customerProductBeforeReset.customer_entitlements,
		featureId: TestFeature.Messages,
		errorOnNotFound: true,
	});

	await ctx.db
		.update(customerEntitlements)
		.set({ next_reset_at: Date.now() - 1_000 })
		.where(eq(customerEntitlements.id, customerEntitlement.id));

	const afterReset = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const customerProduct = findActiveCustomerProductById({
		fullCus: afterReset,
		productId: product.id,
	});
	if (!customerProduct) {
		throw new Error("Expected the attached customer product");
	}
	const resetCustomerEntitlement = findCustomerEntitlementByFeature({
		cusEnts: customerProduct.customer_entitlements,
		featureId: TestFeature.Messages,
		errorOnNotFound: true,
	});
	expect(resetCustomerEntitlement?.next_reset_at).toBeGreaterThan(Date.now());

	const stripeSubscriptionId = "sub_deleted_reset_cache_serialization";
	await customerProductActions.expiredCache.set({
		ctx,
		stripeSubscriptionId,
		customerProducts: [customerProduct],
	});

	const cachedCustomerProducts = await customerProductActions.expiredCache.get({
		ctx,
		stripeSubscriptionId,
	});
	expect(cachedCustomerProducts?.[0]?.id).toBe(customerProduct.id);
});
