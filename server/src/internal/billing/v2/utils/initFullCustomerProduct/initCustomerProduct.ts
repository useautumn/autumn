import {
	BillingVersion,
	CollectionMethod,
	type CusProduct,
	CusProductStatus,
	type InitFullCustomerProductContext,
	type InitFullCustomerProductOptions,
	ms,
	notNullish,
} from "@autumn/shared";
import { generateId } from "@/utils/genUtils";

export const initCustomerProduct = ({
	initContext,
	initOptions,
	customerProductId,
}: {
	initContext: InitFullCustomerProductContext;
	initOptions?: InitFullCustomerProductOptions;
	customerProductId?: string;
}): CusProduct => {
	const {
		fullCustomer,
		fullProduct,
		featureQuantities,
		freeTrial,
		trialEndsAt,
		now,
	} = initContext;
	const {
		subscriptionId,
		subscriptionScheduleId,
		collectionMethod,
		isCustom,
		apiSemver,
	} = initOptions ?? {};

	const internalEntityId = fullCustomer.entity?.internal_id;
	const entityId = fullCustomer.entity?.id;

	const startsAt = initOptions?.startsAt ?? now;
	const endedAt = initOptions?.endedAt;

	const initCustomerProductStatus = () => {
		if (initOptions?.status) return initOptions?.status;

		// 1 minute tolerance to determine if customer product should be scheduled. (for test clock time frozen issues)
		const TOLERANCE_MS = ms.minutes(1);
		if (startsAt && startsAt > now + TOLERANCE_MS) {
			return CusProductStatus.Scheduled;
		}

		return CusProductStatus.Active;
	};
	const status = initCustomerProductStatus();

	const canceled = notNullish(initOptions?.canceledAt);
	const canceledAt = initOptions?.canceledAt;

	const subscriptionIds = subscriptionId ? [subscriptionId] : undefined;

	const scheduleIds = subscriptionScheduleId
		? [subscriptionScheduleId]
		: undefined;

	const billingVersion = initContext.billingVersion ?? BillingVersion.V1;

	return {
		id: customerProductId ?? generateId("cus_prod"),

		internal_customer_id: fullCustomer.internal_id,
		customer_id: fullCustomer.id,
		internal_entity_id: internalEntityId,
		entity_id: entityId,
		internal_product_id: fullProduct.internal_id,
		product_id: fullProduct.id,

		created_at: Date.now(),

		status,

		// Legacy
		// processor: null,

		starts_at: startsAt,
		ended_at: endedAt,

		trial_ends_at: trialEndsAt,
		free_trial_id: freeTrial?.id,

		options: featureQuantities,

		canceled,
		canceled_at: canceledAt,

		subscription_ids: subscriptionIds,
		scheduled_ids: scheduleIds,
		collection_method: collectionMethod ?? CollectionMethod.ChargeAutomatically,

		quantity: 1,

		is_custom: isCustom ?? false,

		api_semver: apiSemver ?? null,

		billing_version: billingVersion,
	};
};

// ? subscriptionStatus
// 			: isFuture
// 				? CusProductStatus.Scheduled
// 				: CusProductStatus.Active

// {
//   type: ProcessorType.Stripe,
//   // subscription_id: subscriptionId,
//   // subscription_schedule_id: subscriptionScheduleId,
//   // last_invoice_id: lastInvoiceId,
// },
