import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useProductContext } from "@/views/products/product/ProductContext";

import { Upload } from "lucide-react";
import { AttachModal } from "./AttachModal";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { toast } from "sonner";
import { FeatureOptions, ProductV2 } from "@autumn/shared";

const getAttachBody = ({
  customerId,
  attachState,
  product,
  entityId,
  optionsInput,
  useInvoice,
  successUrl,
}: {
  customerId: string;
  attachState: any;
  product: ProductV2;
  entityId: string;
  optionsInput?: FeatureOptions[];
  useInvoice?: boolean;
  successUrl?: string;
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
          quantity: option.quantity,
        }))
      : undefined,
    is_custom: isCustom,
    ...customData,
    free_trial: isCustom ? product.free_trial || undefined : undefined,

    invoice_only: useInvoice,
    success_url: successUrl,
  };
};

export const AttachButton = () => {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const { attachState, product, entityId, customer } = useProductContext();
  const [buttonLoading, setButtonLoading] = useState(false);
  const axios = useAxiosInstance();
  const { buttonText } = attachState;

  const handleAttachClicked = async () => {
    setButtonLoading(true);
    try {
      const res = await axios.post(
        "/v1/attach/preview",
        getAttachBody({
          customerId: customer.id || customer.internal_id,
          attachState,
          product,
          entityId,
        }),
      );

      setPreview(res.data.preview);

      setOpen(true);
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to attach product"));
    }
    setButtonLoading(false);
  };

  return (
    <>
      <AttachModal open={open} setOpen={setOpen} preview={preview} />
      <Button
        onClick={handleAttachClicked}
        variant="gradientPrimary"
        className="w-full gap-2"
        startIcon={<Upload size={12} />}
        disabled={attachState.buttonDisabled}
        isLoading={buttonLoading}
      >
        {buttonText}
      </Button>
    </>
  );
};

// const getProductActionState = () => {
//   if (oneTimePurchase) {
//     return {
//       buttonText: "Purchase Product",
//       tooltipText: "Purchase this product for the customer",
//       disabled: false,
//     };
//   }

//   if (product.is_add_on) {
//     return {
//       buttonText: "Enable Product",
//       tooltipText: `Enable product ${product.name} for ${customer.name}`,
//       disabled: false,
//     };
//   }
//   // Case 1: Product is active, no changes, and is not an add-on
//   if (product.isActive && !hasOptionsChanges && !hasChanges) {
//     return {
//       buttonText: "Update Product",
//       tooltipText: "No changes have been made to update",
//       disabled: true,
//     };
//   }

//   if (product.isActive && hasOptionsChanges && !hasChanges) {
//     return {
//       buttonText: "Update Options",
//       tooltipText: "You're editing the quantity of a live product",
//       disabled: false,
//       state: "update_options_only",
//       successMessage: "Product updated successfully",
//     };
//   }

//   if (product.isActive && !product.is_add_on) {
//     return {
//       buttonText: "Update Product",
//       tooltipText: `You're editing the live product ${product.name} and updating it to a custom version for ${customer.name}`,

//       disabled: false, //TODO: remove this
//     };
//   }
//   if (hasChanges) {
//     return {
//       buttonText: "Create Custom Version",
//       tooltipText: `You have edited product ${product.name} and are creating a custom version for ${customer.name}`,
//       disabled: false,
//     };
//   }
//   return {
//     buttonText: "Enable Product",
//     tooltipText: `Enable product ${product.name} for ${customer.name}`,
//     disabled: false,
//   };
// };

// const actionState = getProductActionState();
