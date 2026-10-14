import {
	customerEntitlements,
	customerLicenses,
	customerPrices,
	customerProducts,
} from "@autumn/shared";
import { inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";

export const moveCusProductsToCustomer = async ({
	db,
	cusProductIds,
	destination,
}: {
	db: DrizzleCli;
	cusProductIds: string[];
	destination: { internalId: string; id?: string | null };
}) => {
	await db.transaction(async (tx) => {
		const now = Date.now();
		await tx
			.update(customerProducts)
			.set({
				internal_customer_id: destination.internalId,
				customer_id: destination.id ?? null,
				internal_entity_id: null,
				entity_id: null,
				updated_at: now,
			})
			.where(inArray(customerProducts.id, cusProductIds));
		await tx
			.update(customerEntitlements)
			.set({
				internal_customer_id: destination.internalId,
				customer_id: destination.id ?? null,
				internal_entity_id: null,
			})
			.where(inArray(customerEntitlements.customer_product_id, cusProductIds));
		await tx
			.update(customerPrices)
			.set({ internal_customer_id: destination.internalId })
			.where(inArray(customerPrices.customer_product_id, cusProductIds));
		await tx
			.update(customerLicenses)
			.set({ internal_customer_id: destination.internalId, updated_at: now })
			.where(
				inArray(customerLicenses.parent_customer_product_id, cusProductIds),
			);
	});
};
