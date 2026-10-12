import { type FullCusProduct, ProcessorType } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customerProductRepo } from "@/internal/customers/cusProducts/repos";

/** Stores the store purchase a RevenueCat plan came from, once; PRODUCT_CHANGE finds the plan by it. */
export const storeRevenueCatPurchaseId = async ({
	ctx,
	customerProduct,
	originalTransactionId,
}: {
	ctx: AutumnContext;
	customerProduct: Pick<FullCusProduct, "id" | "processor">;
	originalTransactionId?: string | null;
}) => {
	if (!originalTransactionId) return;
	if (customerProduct.processor?.type !== ProcessorType.RevenueCat) return;
	if (customerProduct.processor.original_transaction_id) return;

	await customerProductRepo.mergeProcessor({
		db: ctx.db,
		cusProductId: customerProduct.id,
		processor: {
			type: ProcessorType.RevenueCat,
			original_transaction_id: originalTransactionId,
		},
	});
};
