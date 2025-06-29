import { Button } from "@/components/ui/button";
import { useState } from "react";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogContent } from "@/components/ui/dialog";
import { useProductContext } from "@/views/products/product/ProductContext";
import { AttachBranch, AttachFunction, Entity, ErrCode } from "@autumn/shared";

import { ArrowUpRightFromSquare } from "lucide-react";
import { PriceItem } from "@/components/pricing/attach-pricing-dialog";
import {
  getBackendErr,
  getBackendErrObj,
  getRedirectUrl,
  navigateTo,
  nullish,
} from "@/utils/genUtils";
import { toast } from "sonner";
import { CusService } from "@/services/customers/CusService";
import { useNavigate } from "react-router";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { getStripeInvoiceLink } from "@/utils/linkUtils";
import { AttachPreviewDetails } from "./AttachPreviewDetails";
import { ToggleConfigButton } from "./ToggleConfigButton";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { AttachInfo } from "./attach-preview/AttachInfo";
import { getAttachBody } from "./attachProductUtils";

export const AttachModal = ({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
}) => {
  const { product, customer, entities, entityId, attachState, version } =
    useProductContext();

  const navigation = useNavigate();
  const env = useEnv();
  const axiosInstance = useAxiosInstance();

  const { preview, options, setOptions, flags } = attachState;
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  const getName = () => {
    const cusName =
      customer?.name || customer?.id || customer.email || customer.internal_id;

    if (entityId) {
      const entity = entities.find(
        (e: Entity) => e.id === entityId || e.internal_id === entityId,
      );
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

  const invoiceAllowed = () => {
    if (preview?.branch == AttachBranch.SameCustomEnts || flags.isFree) {
      return false;
    }
    if (preview?.branch == AttachBranch.Downgrade) {
      return false;
    }
    if (preview?.branch == AttachBranch.Renew) {
      return false;
    }

    // const dueToday = preview?.due_today;
    // if (dueToday && dueToday.total == 0) {
    //   return false;
    // }

    return true;
  };

  const getButtonText = () => {
    if (preview?.branch == AttachBranch.Downgrade) {
      return "Confirm Downgrade";
    }

    if (preview?.branch == AttachBranch.SameCustomEnts || flags.isFree) {
      return "Confirm";
    }

    if (flags.isCanceled) {
      return "Renew Product";
    }

    if (preview?.func == AttachFunction.CreateCheckout) {
      return "Checkout Page";
    }

    const dueToday = preview?.due_today;
    if (dueToday && dueToday.total == 0) {
      return "Confirm";
    }

    return "Charge Customer";
  };

  const handleAttachClicked = async (useInvoice: boolean) => {
    const setLoading = useInvoice ? setInvoiceLoading : setCheckoutLoading;
    const cusId = getCusId();

    for (const option of options) {
      if (
        nullish(option.quantity) &&
        preview?.branch != AttachBranch.SameCustomEnts
      ) {
        toast.error(`Quantity for ${option.feature_name} is required`);
        return;
      }
    }

    try {
      setLoading(true);

      const redirectUrl = getRedirectUrl(`/customers/${cusId}`, env);

      const attachBody = getAttachBody({
        customerId: customer.id || customer.internal_id,
        entityId,
        product,
        optionsInput: options,
        attachState,
        useInvoice,
        successUrl: `${import.meta.env.VITE_FRONTEND_URL}${redirectUrl}`,
        version,
      });

      const { data } = await CusService.attach(axiosInstance, attachBody);

      if (data.checkout_url) {
        window.open(data.checkout_url, "_blank");
      } else if (data.invoice) {
        window.open(getStripeInvoiceLink(data.invoice), "_blank");
      } else {
        navigateTo(`/customers/${cusId}`, navigation, env);
      }

      toast.success(data.message || "Successfully attached product");
      setOpen(false);
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

  const mainWidth = "w-lg";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="gap-0 p-0 rounded-xs">
        <div className="flex transition-all duration-300 ease-in-out">
          <div
            className={`p-6 pb-2 flex flex-col gap-4 ${mainWidth} rounded-sm`}
          >
            <DialogHeader>
              <DialogTitle className="text-t2 text-md">
                Attach product
              </DialogTitle>
            </DialogHeader>

            <div className="text-sm flex flex-col gap-4">
              <div className="flex flex-col">
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

              {preview && !flags.isFree && <AttachPreviewDetails />}
              <AttachInfo />
            </div>

            <div className="my-2"></div>
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

        <DialogFooter
          className={cn(
            "bg-stone-100 flex items-center h-10 gap-0 border-t border-zinc-200",
            mainWidth,
          )}
        >
          {invoiceAllowed() && (
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
          )}
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
