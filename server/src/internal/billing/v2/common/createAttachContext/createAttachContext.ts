import { type AttachBodyV1, RELEVANT_STATUSES } from "@autumn/shared";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import { getStripeCusData } from "../../../../customers/attach/attachUtils/attachParams/attachParamsUtils/getStripeCusData";
import { getOrCreateCustomer } from "../../../../customers/cusUtils/getOrCreateCustomer";
import { getFeatureQuantitiesForAttach } from "./getFeatureQuantitiesForAttach";
import { getFreeTrialForAttach } from "./getFreeTrialForAttach";
import { getProductsForAttach } from "./getProductsForAttach";
import { overrideProduct } from "./overrideProduct";

export const createAttachContext = async ({
	ctx,
	body,
}: {
	ctx: AutumnContext;
	body: AttachBodyV1;
}) => {
	const { org, env } = ctx;
	const {
		customer_id: customerId,
		customer_data: customerData,
		entity_id: entityId,
		entity_data: entityData,
	} = body;

	// 1. Get full customer
	const fullCus = await getOrCreateCustomer({
		ctx,
		customerId,
		customerData,
		inStatuses: RELEVANT_STATUSES,
		withEntities: true,
		entityId,
		entityData,
	});

	// 2. Get full products
	const fullProducts = await getProductsForAttach({
		ctx,
		body,
	});

	// 3. Override product
	const {
		fullProducts: newFullProducts,
		// customPrices,
		// customEnts,
	} = await overrideProduct({
		ctx,
		body,
		products: fullProducts,
		fullCustomer: fullCus,
	});

	// 4. Get free trial
	const { customTrial, freeTrial } = await getFreeTrialForAttach({
		ctx,
		body,
		products: newFullProducts,
		fullCus,
	});

	// 5. Get feature quantities
	const featureQuantities = await getFeatureQuantitiesForAttach({
		ctx,
		body,
		prices: newFullProducts.flatMap((product) => product.prices),
		fullCus,
	});

	// 6. Get stripe customer data
	const { stripeCus, paymentMethod, now } = await getStripeCusData({
		ctx,
		customer: fullCus,
	});
};
