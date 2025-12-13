import {
	CollectionMethod,
	type CusProduct,
	CusProductStatus,
	type InsertCusProductOptions,
	type InsertFullCusProductContext,
	notNullish,
} from "@autumn/shared";

export const initCusProduct = ({
	insertContext,
	insertOptions,
	cusProductId,
}: {
	insertContext: InsertFullCusProductContext;
	insertOptions?: InsertCusProductOptions;
	cusProductId: string;
}): CusProduct => {
	const { fullCus, product, featureQuantities } = insertContext;

	const internalEntityId = fullCus.entity?.internal_id;
	const entityId = fullCus.entity?.id;

	const status = insertOptions?.status ?? CusProductStatus.Active;
	const startsAt = insertOptions?.startsAt ?? Date.now();

	const canceled = notNullish(insertOptions?.canceledAt);
	const canceledAt = insertOptions?.canceledAt;

	const subscriptionIds = insertOptions?.subscriptionId
		? [insertOptions.subscriptionId]
		: undefined;

	const scheduleIds = insertOptions?.subscriptionScheduleId
		? [insertOptions.subscriptionScheduleId]
		: undefined;

	const collectionMethod =
		insertOptions?.collectionMethod ?? CollectionMethod.ChargeAutomatically;

	const isCustom = insertOptions?.isCustom ?? false;

	const apiSemver = insertOptions?.apiSemver ?? null;

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
		collection_method: collectionMethod,

		quantity: 1,

		is_custom: isCustom,

		api_semver: apiSemver,
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
