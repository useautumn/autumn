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
		entity,
	} = initContext;
	const {
		subscriptionId,
		subscriptionScheduleId,
		collectionMethod,
		isCustom,
		apiSemver,
		externalId,
		billingCycleAnchorResetsAt,
		accessStartsAt,
		previousCustomerProductId,
		onTrialEnd,
		processorType,
	} = initOptions ?? {};

	const internalEntityId =
		initOptions?.internalEntityId ?? fullCustomer.entity?.internal_id;
	const entityId =
		initOptions?.internalEntityId && initOptions.internalEntityId !== fullCustomer.entity?.internal_id
			? fullCustomer.entities?.find(
					(e) => e.internal_id === initOptions.internalEntityId,
				)?.id
			: fullCustomer.entity?.id;

	const startsAt = initOptions?.startsAt ?? now;
	const endedAt = initOptions?.endedAt;

	const initCustomerProductStatus = () => {
		if (initOptions?.status) return initOptions?.status;

		// 1 minute tolerance to determine if customer product should be scheduled. (for test clock time frozen issues)
		const TOLERANCE_MS = ms.minutes(1);
		const effectiveAccessStartsAt = accessStartsAt ?? startsAt;
		if (
			effectiveAccessStartsAt &&
			effectiveAccessStartsAt > now + TOLERANCE_MS
		) {
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

		created_at: now,
		updated_at: now,

		status,

		// Only stamp `processor` when an explicit type was supplied (e.g. RevenueCat
		// from external-PSP origin flows). Stripe-origin and legacy callers omit
		// it; `cusProductToProcessorType` resolves the missing field to Stripe.
		...(processorType ? { processor: { type: processorType } } : {}),

		starts_at: startsAt,
		access_starts_at: accessStartsAt ?? null,
		ended_at: endedAt,

		trial_ends_at: trialEndsAt,
		billing_cycle_anchor_resets_at: billingCycleAnchorResetsAt,
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

		external_id: externalId ?? null,

		stripe_checkout_session_id: null,

		previous_customer_product_id: previousCustomerProductId ?? null,
		on_trial_end: onTrialEnd ?? null,
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
