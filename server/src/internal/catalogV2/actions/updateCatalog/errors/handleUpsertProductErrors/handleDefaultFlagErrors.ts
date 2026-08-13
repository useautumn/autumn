import {
	ErrCode,
	type FullProduct,
	isFreeProduct,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

/** is_default guards: never on a historical version, never on a paid plan. */
export const handleDefaultFlagErrors = ({
	nextFullProduct,
	latestExistingVersion,
}: {
	nextFullProduct: FullProduct;
	/** Newest existing version for this plan_id; undefined if plan is new. */
	latestExistingVersion: number | undefined;
}): void => {
	if (!nextFullProduct.is_default) return;

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

	const isFree = isFreeProduct({ prices: nextFullProduct.prices });
	const isCardlessTrial = nextFullProduct.free_trial?.card_required === false;
	if (!isFree && !isCardlessTrial) {
		throw new RecaseError({
			code: ErrCode.InvalidRequest,
			message:
				"Default plans must be free or have a free trial with card_required false",
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}
};
