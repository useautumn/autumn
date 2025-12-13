import {
	type AttachBodyV1,
	type AttachContext,
	type CusProductActions,
	type FullCustomer,
	RELEVANT_STATUSES,
	resolveAttachActions,
} from "@autumn/shared";

import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import { getStripeCusData } from "../../../../customers/attach/attachUtils/attachParams/attachParamsUtils/getStripeCusData";
import { getOrCreateCustomer } from "../../../../customers/cusUtils/getOrCreateCustomer";
import { enrichAttachActions } from "../../../billingUtils/enrichAttachActions/enrichAttachActions";
import { getAttachSub } from "../../../billingUtils/getAttachSub";
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
		customPrices,
		customEnts,
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

	const {
		stripeCus,
		paymentMethod,
		now: testClockFrozenTime,
	} = await getStripeCusData({
		ctx,
		customer: fullCus,
	});

	const { sub } = await getAttachSub({
		ctx,
		fullCus,
		products: newFullProducts,
	});

	const attachContext: AttachContext = {
		fullCus,
		products: newFullProducts,

		freeTrial: freeTrial ?? undefined,
		featureQuantities: featureQuantities ?? [],

		sub,
		testClockFrozenTime,
	};

	const actions = resolveAttachActions({
		fullCus,
		products: newFullProducts,
	});

	const logAttachActions = (cusProductActions: CusProductActions) => {
		const {
			ongoingCusProductAction,
			scheduledCusProductAction,
			newProductActions,
		} = cusProductActions;
		console.log("Cus product actions:", {
			ongoing: ongoingCusProductAction
				? `${ongoingCusProductAction?.action} ${ongoingCusProductAction?.cusProduct.product.id}`
				: "none",
			scheduled: scheduledCusProductAction
				? `${scheduledCusProductAction?.action} ${scheduledCusProductAction?.cusProduct.product.id}`
				: "none",
			new:
				newProductActions.length > 0
					? newProductActions.map(
							(newProductAction) =>
								`insert ${newProductAction.product.id} (${newProductAction.timing})`,
						)
					: "none",
		});
	};

	logAttachActions(actions);

	// Get cus product to merge subscription with
	await enrichAttachActions({
		ctx,
		fullCus,
		actions,
		attachContext,
	});

	// Enrich actions
	// 1. Fetch current subscription
	// 2. Fetch current schedule
	// 2. Add to new product actions
	// 3. For scheduling a product, need to figure out when it starts
	// 4. For cancelling a product, need to figure out when it ends
	// 5. Figure out free trial stuff
	// 6. Determine reset anchor (should be same as billing anchor for now)
	// 7. If expiring a product, need to figure out carrying usage over
	// 8. If expiring a product, need to figure out carrying rollovers over
	// 9. Updating one time product?

	// NEXT: execute the actions
	const applyCusProductActions = async ({
		ctx,
		fullCus,
		cusProductActions,
	}: {
		ctx: AutumnContext;
		fullCus: FullCustomer;
		cusProductActions: CusProductActions;
	}) => {
		// // 1. Execute new product actions
		// for (const newProductAction of newProductActions) {
		// 	// await executeNewProductAction({
		// 	// 	ctx,
		// 	// 	newProductAction,
		// 	// });
		// }
		// // 2. Execute active cus product action
		// if (ongoingCusProductAction) {
		// 	await executeActiveCusProductAction({
		// 		ctx,
		// 		ongoingCusProductAction,
		// 	});
		// }
		// // 3. Execute scheduled cus product action
		// if (scheduledCusProductAction) {
		// 	await executeScheduledCusProductAction({
		// 		ctx,
		// 		scheduledCusProductAction,
		// 	});
		// }
	};

	await applyCusProductActions({
		ctx,
		fullCus,
		cusProductActions: actions,
	});
};
