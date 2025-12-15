import {
	CollectionMethod,
	type CusProduct,
	CusProductStatus,
	type InitFullCusProductContext,
	type InitFullCusProductOptions,
	notNullish,
} from "@autumn/shared";

export const initCusProduct = ({
	initContext,
	initOptions,
	cusProductId,
}: {
	initContext: InitFullCusProductContext;
	initOptions?: InitFullCusProductOptions;
	cusProductId: string;
}): CusProduct => {
	const { fullCus, product, featureQuantities } = initContext;
	const {
		subscriptionId,
		subscriptionScheduleId,
		collectionMethod,
		isCustom,
		apiSemver,
	} = initOptions ?? {};

	const internalEntityId = fullCus.entity?.internal_id;
	const entityId = fullCus.entity?.id;

	const status = initOptions?.status ?? CusProductStatus.Active;
	const startsAt = initOptions?.startsAt ?? Date.now();

	const canceled = notNullish(initOptions?.canceledAt);
	const canceledAt = initOptions?.canceledAt;

	const subscriptionIds = subscriptionId ? [subscriptionId] : undefined;

	const scheduleIds = subscriptionScheduleId
		? [subscriptionScheduleId]
		: undefined;

	return {
		id: cusProductId,

		internal_customer_id: fullCus.internal_id,
		customer_id: fullCus.id,
		internal_entity_id: internalEntityId,
		entity_id: entityId,
		internal_product_id: product.internal_id,
		product_id: product.id,

		created_at: Date.now(),

		status,

		// Legacy
		// processor: null,

		starts_at: startsAt || Date.now(),

		trial_ends_at: null,
		free_trial_id: null,

		options: featureQuantities,

		canceled,
		canceled_at: canceledAt,

		subscription_ids: subscriptionIds,
		scheduled_ids: scheduleIds,
		collection_method: collectionMethod ?? CollectionMethod.ChargeAutomatically,

		quantity: 1,

		is_custom: isCustom ?? false,

		api_semver: apiSemver ?? null,
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
