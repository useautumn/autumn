import type {
	BillingBehavior,
	CancelAction,
	CreateFreeTrial,
	FeatureOptions,
	ProductItem,
	ProductV2,
	RefundBehavior,
} from "@autumn/shared";

export const getUpdateSubscriptionBody = ({
	customerId,
	product,
	entityId,
	optionsInput,
	useInvoice,
	enableProductImmediately = true,
	successUrl,
	version,
	isCustom = false,
	freeTrial,
	items,
	cancelAction,
	billingBehavior,
	refundBehavior,
}: {
	customerId: string;
	product: ProductV2;
	entityId?: string;
	optionsInput?: FeatureOptions[];
	useInvoice?: boolean;
	enableProductImmediately?: boolean;
	successUrl?: string;
	version?: number;
	isCustom?: boolean;
	// Free trial param - null removes trial, undefined preserves existing
	freeTrial?: CreateFreeTrial | null;
	// Custom items - separate from isCustom logic for preview support
	items?: ProductItem[] | null;
	// Cancel action fields
	cancelAction?: CancelAction | null;
	billingBehavior?: BillingBehavior | null;
	refundBehavior?: RefundBehavior | null;
}) => {
	// For cancel actions, only include cancellation-related fields
	if (cancelAction) {
		return {
			customer_id: customerId,
			product_id: product.id,
			entity_id: entityId || undefined,
			cancel_action: cancelAction,
			billing_behavior:
				cancelAction === "cancel_immediately"
					? billingBehavior || undefined
					: undefined,
			refund_behavior:
				cancelAction === "cancel_immediately"
					? refundBehavior || undefined
					: undefined,
		};
	}

	const customData = isCustom
		? {
				items: product.items,
				free_trial: product.free_trial,
			}
		: {};

	// Determine free_trial value:
	// 1. If freeTrial is explicitly set (including null), use it
	// 2. If isCustom, use product.free_trial
	// 3. Otherwise, undefined (preserve existing)
	const getFreeTrialValue = () => {
		if (freeTrial !== undefined) {
			return freeTrial;
		}
		if (isCustom) {
			return product.free_trial || undefined;
		}
		return undefined;
	};

	return {
		customer_id: customerId,
		product_id: product.id,
		entity_id: entityId || undefined,
		options: optionsInput
			? optionsInput.map((option) => ({
					feature_id: option.feature_id,
					quantity: option.quantity || 0,
				}))
			: undefined,
		is_custom: isCustom,
		...customData,
		// Override items if explicitly provided (for preview with custom items)
		...(items && items.length > 0 ? { items } : {}),
		free_trial: getFreeTrialValue(),

		invoice: useInvoice,
		enable_product_immediately: useInvoice
			? enableProductImmediately
			: undefined,
		finalize_invoice: useInvoice ? false : undefined,

		force_checkout:
			useInvoice && enableProductImmediately === false ? true : undefined,

		success_url: successUrl,
		version: version ? Number(version) : undefined,
		billing_behavior: billingBehavior || undefined,
	};
};
