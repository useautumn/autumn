import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogContent } from "@/components/ui/dialog";
import { useProductContext } from "@/views/products/product/ProductContext";
import {
  AttachScenario,
  CheckProductPreview,
  Entity,
  ErrCode,
  FeatureOptions,
} from "@autumn/shared";
import { AttachCase } from "../hooks/useAttachState";

import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRightFromSquare,
  InfoIcon,
  Link,
  ArrowLeft,
} from "lucide-react";
import {
  PriceItem,
  TotalPrice,
  QuantityInput,
} from "@/components/pricing/attach-pricing-dialog";
import {
  getBackendErr,
  getBackendErrObj,
  getRedirectUrl,
  navigateTo,
} from "@/utils/genUtils";
import { toast } from "sonner";
import { CusService } from "@/services/customers/CusService";
import { useNavigate } from "react-router";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { getStripeInvoiceLink } from "@/utils/linkUtils";
import { AttachPreviewDetails } from "./AttachPreviewDetails";
import { ToggleConfigButton } from "./ToggleConfigButton";

export const AttachModal = ({
  open,
  setOpen,
  preview,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  preview: CheckProductPreview;
}) => {
  const { product, customer, entities, entityId, attachState } =
    useProductContext();

  const navigation = useNavigate();
  const env = useEnv();
  const axiosInstance = useAxiosInstance();

  const { attachCase } = attachState;
  const [optionsInput, setOptionsInput] = useState<
    {
      feature_id: string;
      feature_name: string;
      billing_units: number;
      price?: number;
      quantity?: number;
    }[]
  >(preview?.options || []);

  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  const getName = () => {
    const cusName =
      customer?.name || customer?.id || customer.email || customer.internal_id;

    if (entityId) {
      const entity = entities.find((e: Entity) => e.id === entityId);
      const entityName = entity?.name || entity?.id || entity?.internal_id;
      return `${cusName} (${entityName})`;
    }

    return cusName;
  };

  const getCusId = () => {
    let cusId = customer.id || customer.internal_id;
    if (entityId) {
      cusId = `${cusId}?entity_id=${entityId}`;
    }
    return cusId;
  };

  const getAttachDescription = () => {
    switch (attachCase) {
      case AttachCase.Checkout:
        return "This customer does not have a card on file.";
      case AttachScenario.New:
        return "Clicking confirm will create a new product for the customer.";
      case AttachScenario.Upgrade:
        return `The customer is upgrading from ${preview?.current_product_name} to ${product.name}. This will happen immediately.`;
      default:
        return "Attach the product to the customer.";
    }
  };

  const getButtonText = () => {
    if (!preview?.payment_method) {
      return "Checkout Page";
    }

    return "Charge Customer";
  };

  const handleAttachClicked = async (useInvoice: boolean) => {
    const setLoading = useInvoice ? setInvoiceLoading : setCheckoutLoading;
    const cusId = getCusId();

    try {
      setLoading(true);

      const isCustom = attachState.itemsChanged;
      const customData = attachState.itemsChanged
        ? {
            items: product.items,
            free_trial: product.free_trial,
          }
        : {};

      const redirectUrl = getRedirectUrl(`/customers/${cusId}`, env);

      const { data } = await CusService.attach(axiosInstance, customer.id, {
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

        invoice_only: useInvoice,
        free_trial: product.free_trial || undefined,
        success_url: `${import.meta.env.VITE_PUBLIC_FRONTEND_URL}${redirectUrl}`,
      });

      // 1. If checkout url, open checkout dialog

      if (data.checkout_url) {
        window.open(data.checkout_url, "_blank");
      } else if (data.invoice) {
        window.open(getStripeInvoiceLink(data.invoice), "_blank");
      } else {
        navigateTo(`/customers/${cusId}`, navigation, env);
      }

      toast.success(data.message || "Successfully attached product");
    } catch (error) {
      console.log("Error creating product: ", error);
      const errObj = getBackendErrObj(error);

      if (errObj?.code === ErrCode.StripeConfigNotFound) {
        toast.error(errObj?.message);
        const redirectUrl = getRedirectUrl(`/customers/${customer.id}`, env);
        navigateTo(
          `/integrations/stripe?redirect=${redirectUrl}`,
          navigation,
          env,
        );
      } else {
        toast.error(getBackendErr(error, "Error creating product"));
      }
    } finally {
      setLoading(false);
    }
  };

  const [configOpen, setConfigOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-fit gap-0 p-0 rounded-xs">
        <div className="flex transition-all duration-300 ease-in-out">
          <div className="p-6 pb-2 flex flex-col gap-4 w-md rounded-sm">
            <DialogHeader>
              <DialogTitle className="text-t2 text-md">
                Attach product
              </DialogTitle>
            </DialogHeader>

            <div className="text-sm flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <p className="text-t2 font-semibold mb-2">Details</p>
                <PriceItem>
                  <span>Product</span>
                  <span>{product?.name}</span>
                </PriceItem>
                <PriceItem>
                  <span>Customer</span>
                  <span>{getName()}</span>
                </PriceItem>
              </div>

              {preview && (
                <>
                  <div className="h-px bg-zinc-200"></div>
                  <AttachPreviewDetails
                    options={optionsInput}
                    setOptions={setOptionsInput}
                    preview={preview}
                  />
                </>
              )}
            </div>
            <div className="flex items-center p-2 bg-blue-50 border-1 border-blue-200 text-blue-400 rounded-xs">
              <div className="min-w-6 flex">
                <InfoIcon size={14} />
              </div>
              <p className="text-sm">{getAttachDescription()}</p>
            </div>
            <div className="flex justify-end">
              <ToggleConfigButton
                configOpen={configOpen}
                setConfigOpen={setConfigOpen}
              />
            </div>
          </div>
          <div
            className={`transition-all duration-300 ease-in-out border-l border-zinc-200 overflow-hidden ${
              configOpen ? "max-w-xs opacity-100" : "max-w-0 opacity-0"
            }`}
          >
            <div className="p-6 pb-0 w-xs">
              <p className="text-t2 text-sm font-semibold">Advanced</p>
            </div>
          </div>
        </div>

        <DialogFooter className="bg-stone-100 flex items-center h-10 gap-0 border-t border-zinc-200">
          <Button
            variant="add"
            className="!h-full text-t2"
            endIcon={<ArrowUpRightFromSquare size={12} />}
            disableStartIcon={true}
            tabIndex={-1}
            tooltipContent="This will enable the product for the customer immediately, and redirect you to Stripe to finalize the invoice"
            isLoading={invoiceLoading}
            disabled={invoiceLoading || checkoutLoading}
            onClick={() => handleAttachClicked(true)}
          >
            Invoice Customer
          </Button>
          <Button
            variant="add"
            className="!h-full"
            disableStartIcon={true}
            endIcon={<ArrowUpRightFromSquare size={12} />}
            isLoading={checkoutLoading}
            disabled={invoiceLoading || checkoutLoading}
            onClick={() => handleAttachClicked(false)}
          >
            {getButtonText()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
