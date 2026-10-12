import { invalidateCustomerInvoicesCache } from "@autumn/cache";
import { type FullCusProduct, invoices, ProcessorType } from "@autumn/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";
import { getMiscCacheContext } from "@/external/redis/miscCache/getMiscCacheContext";

/** Re-owns each moved purchase's original receipt, so later events keyed by that purchase find the new holder. */
export const moveRevenueCatInvoicesToCustomer = async ({
	db,
	cusProducts,
	sourceInternalId,
	destinationInternalId,
}: {
	db: DrizzleCli;
	cusProducts: FullCusProduct[];
	sourceInternalId: string;
	destinationInternalId: string;
}) => {
	const transactionIds = cusProducts.flatMap(
		(cusProduct) => cusProduct.processor?.original_transaction_id ?? [],
	);
	if (transactionIds.length === 0) return;

	const moved = await db
		.update(invoices)
		.set({ internal_customer_id: destinationInternalId })
		.where(
			and(
				inArray(invoices.stripe_id, transactionIds),
				eq(invoices.processor_type, ProcessorType.RevenueCat),
				eq(invoices.internal_customer_id, sourceInternalId),
			),
		)
		.returning({ id: invoices.id });
	if (moved.length === 0) return;

	await invalidateCustomerInvoicesCache({
		ctx: getMiscCacheContext(),
		internalCustomerIds: [sourceInternalId, destinationInternalId],
	});
};
