import { ErrCode, RecaseError } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { activeFullProductForPlan } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/activeFullProductForPlan";

/** API `base_variant_id` → internal pointer. Omit = no write; `null` = detach. */
export const resolveBaseVariantIdPointer = ({
	baseVariantId,
	productStatesContext,
}: {
	baseVariantId: string | null | undefined;
	productStatesContext: ProductStatesContext;
}): string | null | undefined => {
	if (baseVariantId === undefined) return undefined;
	if (baseVariantId === null) return null;

	const parent = activeFullProductForPlan({
		planId: baseVariantId,
		productStatesContext,
	});
	if (!parent) {
		throw new RecaseError({
			message: `base_variant_id ${baseVariantId} is not an existing plan`,
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}
	return parent.internal_id;
};
