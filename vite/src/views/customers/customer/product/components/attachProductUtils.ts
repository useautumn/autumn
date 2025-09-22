import { FeatureOptions, ProductV2 } from "@autumn/shared";

export type FrontendProduct = ProductV2 & {
	isActive: boolean;
	options: FeatureOptions[];
	isCanceled: boolean;
};

export const getAttachBody = ({
	customerId,
	attachState,
	product,
	entityId,
	optionsInput,
	useInvoice,
	enableProductImmediately = true,
	successUrl,
	version,
}: {
	customerId: string;
	attachState: any;
	product: ProductV2;
	entityId: string;
	optionsInput?: FeatureOptions[];
	useInvoice?: boolean;
	enableProductImmediately?: boolean;
	successUrl?: string;
	version?: number;
}) => {
	const isCustom =
		attachState.itemsChanged || attachState.cusProduct?.is_custom;

	const customData = isCustom
		? {
				items: product.items,
				free_trial: product.free_trial,
			}
		: {};

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
		free_trial: isCustom ? product.free_trial || undefined : undefined,

		invoice: useInvoice,
		enable_product_immediately: useInvoice
			? enableProductImmediately
			: undefined,
		finalize_invoice: useInvoice ? false : undefined,

		force_checkout:
			useInvoice && enableProductImmediately === false ? true : undefined,

		success_url: successUrl,
		version: version ? Number(version) : undefined,
	};
};
