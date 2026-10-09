import { reportError } from "@autumn/errors";
import type { Feature, FullCusProduct, FullProduct } from "@autumn/shared";
import { cusProductToProcessorType, ProcessorType } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customDiffToReasons } from "./customDiffToReasons";
import { diffCustomerProductAgainstCatalog } from "./diffCustomerProductAgainstCatalog";
import type { CustomerProductIsCustomResult } from "./types/customerProductIsCustomResult";

/** Best-effort: a reporting failure must never change the derived flag. */
const reportDerivationFailure = ({
	ctx,
	customerProduct,
	error,
}: {
	ctx: Pick<AutumnContext, "logger">;
	customerProduct: FullCusProduct;
	error: unknown;
}) => {
	try {
		const ids = {
			customer_product_id: customerProduct.id,
			internal_product_id: customerProduct.internal_product_id,
		};
		reportError({
			ctx: { logger: ctx.logger.child({ context: ids }) },
			error: new Error(
				`is_custom derivation failed for customer product ${ids.customer_product_id} (product ${ids.internal_product_id}): ${error instanceof Error ? error.message : String(error)}`,
				{ cause: error },
			),
			operation: "derive customer product is_custom",
		});
	} catch {}
};

/** Whether, and how, a customer product differs from its catalog version. Biased towards
 * custom: a false negative lets a migration overwrite real customizations. */
export const deriveCustomerProductIsCustom = ({
	ctx,
	customerProduct,
	baseProduct,
	features,
}: {
	ctx: Pick<AutumnContext, "logger">;
	customerProduct: FullCusProduct;
	/** The catalog version `customerProduct.internal_product_id` points at,
	 * loaded with custom rows excluded. Nullish when it could not be resolved. */
	baseProduct?: FullProduct | null;
	features: Feature[];
}): CustomerProductIsCustomResult => {
	// RevenueCat purchases carry no params and can't be customised, so any diff is catalog drift.
	if (cusProductToProcessorType(customerProduct) === ProcessorType.RevenueCat) {
		return { isCustom: false, outcome: "revenuecat" };
	}

	if (!baseProduct) return { isCustom: true, outcome: "catalog_missing" };

	try {
		const diff = diffCustomerProductAgainstCatalog({
			customerProduct,
			baseProduct,
			features,
		});
		if (!diff) return { isCustom: false, outcome: "matches_catalog" };
		return {
			isCustom: true,
			outcome: "customized",
			reasons: customDiffToReasons({ diff }),
			diff,
		};
	} catch (error) {
		reportDerivationFailure({ ctx, customerProduct, error });
		return { isCustom: true, outcome: "comparison_failed" };
	}
};
