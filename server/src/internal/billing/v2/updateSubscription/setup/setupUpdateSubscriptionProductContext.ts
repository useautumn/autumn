import {
	type FullCustomer,
	InternalError,
	type UpdateSubscriptionV0Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupCustomFullProduct } from "../../setup/setupCustomFullProduct";
import { findTargetCustomerProduct } from "./findTargetCustomerProduct";
import { getFullProductForVersion } from "./getFullProductForVersion";

export const setupUpdateSubscriptionProductContext = async ({
	ctx,
	fullCustomer,
	params,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	params: UpdateSubscriptionV0Params;
}) => {
	const targetCustomerProduct = findTargetCustomerProduct({
		params,
		fullCustomer,
	});

	if (!targetCustomerProduct) {
		throw new InternalError({
			message: `[API Subscription Update] Target customer product not found: ${params.product_id}`,
		});
	}

	const fullProduct = await getFullProductForVersion({
		ctx,
		targetCustomerProduct,
		version: params.version,
	});

	const {
		fullProduct: customFullProduct,
		customPrices,
		customEnts,
	} = await setupCustomFullProduct({
		ctx,
		currentFullProduct: fullProduct,
		customItems: params.items,
	});

	return {
		customerProduct: targetCustomerProduct,
		fullProduct: customFullProduct,
		customPrices,
		customEnts,
	};
};
