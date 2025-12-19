import { type AttachBodyV1, RELEVANT_STATUSES } from "@autumn/shared";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv";
import { getOrCreateCustomer } from "../../../customers/cusUtils/getOrCreateCustomer";
import { getFreeTrialForAttach } from "./fetchAutumnUtils/getFreeTrialForAttach";
import { getProductsForAttach } from "./fetchAutumnUtils/getProductsForAttach";
import { overrideProduct } from "./fetchAutumnUtils/overrideProduct";
import { resolveAttachActions } from "./fetchAutumnUtils/resolveAttachActions/resolveAttachActions";
import { fetchStripeCustomerForBilling } from "./fetchStripeUtils/fetchStripeCustomerForBilling";
import { fetchStripeSubscriptionForBilling } from "./fetchStripeUtils/fetchStripeSubscriptionForBilling";

export const fetchAttachContext = async ({
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

	ctx.logger.info(`fetching attach context`);

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
		// customPrices,
		// customEnts,
		fullProducts: newFullProducts,
	} = await overrideProduct({
		ctx,
		body,
		products: fullProducts,
		fullCustomer: fullCus,
	});

	// 4. Get free trial
	const {
		// customTrial,
		freeTrial,
	} = await getFreeTrialForAttach({
		ctx,
		body,
		products: newFullProducts,
		fullCus,
	});

	// 5. Get sub update context

	// 5. Get stripe sub
	const stripeSub = await fetchStripeSubscriptionForBilling({
		ctx,
		fullCus,
		products: newFullProducts,
	});

	// 6. Get stripe customer
	const { stripeCus, paymentMethod, now } = await fetchStripeCustomerForBilling(
		{
			ctx,
			fullCus,
		},
	);

	const cusProductActions = resolveAttachActions({
		fullCus,
		products: newFullProducts,
	});

	return {
		fullCus,
		products: newFullProducts,
		freeTrial: freeTrial ?? undefined,

		stripeSub,
		stripeCus,
		paymentMethod,
		testClockFrozenTime: now,

		ongoingCusProductAction: cusProductActions.ongoingCusProductAction,
		scheduledCusProductAction: cusProductActions.scheduledCusProductAction,

		// The rest of the context (body)
		body,
	};
};
