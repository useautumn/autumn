import type {
	FeatureOptions,
	FullCusProduct,
	OngoingCusProductAction,
} from "@autumn/shared";
import type { AutumnContext } from "../../../../../honoUtils/HonoEnv";
import type { QuantityUpdateDetails } from "../../types";
import { applyOngoingCusProductAction } from "./applyOngoingCusProductAction";
import { insertNewCusProducts } from "./insertNewCusProducts";
import { updateCustomerEntitlements } from "./updateCustomerEntitlements";
import { updateCustomerProductOptions } from "./updateCustomerProductOptions";

export const executeCusProductActions = async ({
	ctx,
	ongoingCusProductAction,
	newCusProducts,
	quantityUpdateDetails,
	updatedFeatureOptions,
}: {
	ctx: AutumnContext;
	ongoingCusProductAction?: OngoingCusProductAction;
	newCusProducts: FullCusProduct[];
	quantityUpdateDetails?: QuantityUpdateDetails[];
	updatedFeatureOptions?: FeatureOptions[];
}) => {
	const { logger } = ctx;

	logger.info("Inserting new customer products");
	await insertNewCusProducts({
		ctx,
		newCusProducts,
	});

	if (ongoingCusProductAction) {
		logger.info(
			`Applying ongoing customer product action: ${ongoingCusProductAction.action}`,
		);
		await applyOngoingCusProductAction({
			ctx,
			ongoingCusProductAction,
		});
	}

	if (updatedFeatureOptions && ongoingCusProductAction?.cusProduct) {
		logger.info("Updating customer product options");
		await updateCustomerProductOptions({
			ctx,
			customerProductId: ongoingCusProductAction.cusProduct.id,
			updatedFeatureOptions,
		});
	}

	if (quantityUpdateDetails && quantityUpdateDetails.length > 0) {
		logger.info("Updating customer entitlements");
		await updateCustomerEntitlements({
			ctx,
			quantityUpdateDetails,
		});
	}

	logger.info("Successfully executed all customer product actions");
};
