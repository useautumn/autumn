import type { FeatureOptions } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

/**
 * Update customer product options with new feature quantities.
 *
 * Extracted from:
 * - updateQuantityFlow.ts:55-59
 */
export const updateCustomerProductOptions = async ({
	ctx,
	customerProductId,
	updatedFeatureOptions,
}: {
	ctx: AutumnContext;
	customerProductId: string;
	updatedFeatureOptions: FeatureOptions[];
}) => {
	const { db, logger } = ctx;

	logger.info(
		`Updating customer product ${customerProductId} with ${updatedFeatureOptions.length} feature options`,
	);

	await CusProductService.update({
		db,
		cusProductId: customerProductId,
		updates: { options: updatedFeatureOptions },
	});

	logger.info("Successfully updated customer product options");
};
