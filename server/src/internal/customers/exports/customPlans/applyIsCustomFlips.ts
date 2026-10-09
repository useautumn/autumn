import type { FullCusProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { invalidateCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/invalidate/invalidateFullSubject.js";
import type { CustomerProductIsCustomResult } from "@/internal/customers/cusProducts/actions/deriveIsCustom/types/customerProductIsCustomResult.js";
import { customerProductRepo } from "@/internal/customers/cusProducts/repos/index.js";
import type { CustomerExportScalarRow } from "../queries/getCustomerExportScalars.js";

export type DerivedCustomerProduct = {
	customerProduct: FullCusProduct;
	result: CustomerProductIsCustomResult;
};

export const isApplicableFlip = ({
	customerProduct,
	result,
}: DerivedCustomerProduct) => {
	const flagChanges = customerProduct.is_custom !== result.isCustom;
	const isDefinitive =
		result.reason !== "catalog_missing" &&
		result.reason !== "comparison_failed";
	return flagChanges && isDefinitive;
};

export const applyIsCustomFlips = async ({
	ctx,
	scalar,
	derived,
}: {
	ctx: AutumnContext;
	scalar: CustomerExportScalarRow;
	derived: DerivedCustomerProduct[];
}): Promise<Set<string>> => {
	const written = new Set<string>();

	try {
		for (const { customerProduct, result } of derived.filter(
			isApplicableFlip,
		)) {
			const wrote = await customerProductRepo.setIsCustom({
				ctx,
				internalCustomerId: scalar.internal_id,
				customerProductId: customerProduct.id,
				from: customerProduct.is_custom,
				to: result.isCustom,
				readUpdatedAt: customerProduct.updated_at,
			});
			if (wrote) written.add(customerProduct.id);
		}
	} finally {
		if (written.size > 0 && scalar.id) {
			await invalidateCachedFullSubject({
				ctx,
				customerId: scalar.id,
				source: "custom-plans-export",
			});
		}
	}
	return written;
};
