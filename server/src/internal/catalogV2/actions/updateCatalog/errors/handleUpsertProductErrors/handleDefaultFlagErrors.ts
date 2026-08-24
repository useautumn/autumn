import {
	ErrCode,
	type FullProduct,
	isEligibleDefaultProduct,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

/** is_default guards: never *set* on a historical version or paid plan. Preserving an existing flag is fine. */
export const handleDefaultFlagErrors = ({
	nextFullProduct,
	currentFullProduct,
	latestExistingVersion,
}: {
	nextFullProduct: FullProduct;
	currentFullProduct?: FullProduct | null;
	/** Newest existing version for this plan_id; undefined if plan is new. */
	latestExistingVersion: number | undefined;
}): void => {
	if (!nextFullProduct.is_default) return;
	if (currentFullProduct?.is_default) return;
	if (
		isEligibleDefaultProduct({
			product: nextFullProduct,
			latestExistingVersion,
		})
	) {
		return;
	}

	if (nextFullProduct.base_internal_product_id) {
		throw new RecaseError({
			code: ErrCode.VariantCannotBeDefault,
			message: `Cannot set is_default on variant plan ${nextFullProduct.id}`,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	if (
		latestExistingVersion !== undefined &&
		nextFullProduct.version < latestExistingVersion
	) {
		throw new RecaseError({
			code: ErrCode.HistoricalPlanVersionCannotBeDefault,
			message: `Cannot set is_default on historical version ${nextFullProduct.version} of plan ${nextFullProduct.id} (latest is ${latestExistingVersion})`,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	throw new RecaseError({
		code: ErrCode.InvalidRequest,
		message:
			"Default plans must be free or have a free trial with card_required false",
		statusCode: StatusCodes.BAD_REQUEST,
	});
};
