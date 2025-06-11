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
  successUrl,
  version,
}: {
  customerId: string;
  attachState: any;
  product: ProductV2;
  entityId: string;
  optionsInput?: FeatureOptions[];
  useInvoice?: boolean;
  successUrl?: string;
  version?: number;
}) => {
  const isCustom = attachState.itemsChanged;
  const customData = attachState.itemsChanged
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

    invoice_only: useInvoice,
    success_url: successUrl,
    version: version ? Number(version) : undefined,
  };
};
