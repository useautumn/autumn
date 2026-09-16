import { z } from "zod/v4";

const InsertCustomerProductIdSchema = z.object({
	product: z.object({
		id: z.string().min(1),
	}),
});

const DeferredCheckoutInsertsSchema = z.object({
	billingPlan: z.object({
		autumn: z.object({
			insertCustomerProducts: z.array(InsertCustomerProductIdSchema),
		}),
	}),
});

/** Product ids from deferred checkout metadata. `undefined` if the shape is unusable. */
export const checkoutProductIdsFromDeferredData = ({
	deferredData,
}: {
	deferredData: unknown;
}): string[] | undefined => {
	const parsed = DeferredCheckoutInsertsSchema.safeParse(deferredData);
	if (!parsed.success) return undefined;

	const productIds = parsed.data.billingPlan.autumn.insertCustomerProducts.map(
		(customerProduct) => customerProduct.product.id,
	);
	if (productIds.length === 0) return undefined;

	return productIds;
};
