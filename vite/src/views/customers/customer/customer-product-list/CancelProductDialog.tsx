import {
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CusProductStatus, FullCusProduct } from "@autumn/shared";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { useState } from "react";
import { toast } from "sonner";
import { useCustomerContext } from "../CustomerContext";
import { notNullish } from "@/utils/genUtils";

export const CancelProductDialog = ({
  cusProduct,
  open,
  setOpen,
}: {
  cusProduct: FullCusProduct;
  open: boolean;
  setOpen: (open: boolean) => void;
}) => {
  const [immediateLoading, setImmediateLoading] = useState(false);
  const [endOfCycleLoading, setEndOfCycleLoading] = useState(false);
  const axiosInstance = useAxiosInstance();
  const { cusMutate, customer, entities } = useCustomerContext();

  const handleClicked = async (cancelImmediately?: boolean) => {
    if (cancelImmediately) {
      setImmediateLoading(true);
    } else {
      setEndOfCycleLoading(true);
    }

    const entity = entities.find(
      (e: any) => e.internal_id === cusProduct.internal_entity_id
    );

    try {
      await axiosInstance.post(`/v1/cancel`, {
        customer_id: cusProduct.customer_id || cusProduct.internal_customer_id,
        product_id: cusProduct.product_id,
        entity_id: entity?.id || entity?.internal_id,
        cancel_immediately: cancelImmediately,
      });
      await cusMutate();
      setOpen(false);
      toast.success("Product cancelled");
    } catch (error) {
      toast.error("Failed to cancel product");
    } finally {
      if (cancelImmediately) {
        setImmediateLoading(false);
      } else {
        setEndOfCycleLoading(false);
      }
    }
  };

  const isDefault = cusProduct.product.is_default;
  const isScheduled = cusProduct.status == CusProductStatus.Scheduled;
  const hasSubscription =
    cusProduct.subscription_ids && cusProduct.subscription_ids.length > 0;

  const currentMain = customer.customer_products.find(
    (cp: any) =>
      !cp.is_add_on &&
      cp.product_id !== cusProduct.product_id &&
      cp.product.group == cusProduct.product.group &&
      (cp.status == CusProductStatus.Active ||
        cp.status == CusProductStatus.PastDue) &&
      cp.internal_entity_id == cusProduct.internal_entity_id
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Cancel Product</DialogTitle>
        </DialogHeader>

        <div className="mb-2 text-sm">
          {isScheduled ? (
            <p className="text-t2">
              This product is scheduled to start on{" "}
              {formatUnixToDateTime(cusProduct.starts_at).date}.
              {currentMain
                ? ` Are you sure you want to remove this schedule and renew the current product (${currentMain.product.name})?`
                : " Are you sure you want to remove this schedule?"}
            </p>
          ) : isDefault ? (
            <p className="text-t2">
              This is a default product. Cancelling it will simply reset the
              feature usages for this customer.
            </p>
          ) : (
            <p className="text-t2">
              Are you sure you want to cancel this product? This action cannot
              be undone.
            </p>
          )}
        </div>

        <DialogFooter>
          <div className="flex gap-2">
            {isScheduled ? (
              <Button
                onClick={() => handleClicked(true)}
                variant="destructive"
                isLoading={immediateLoading}
              >
                Cancel scheduled product
              </Button>
            ) : isDefault ? (
              <Button
                onClick={() => handleClicked(true)}
                variant="destructive"
                isLoading={immediateLoading}
              >
                Cancel default product
              </Button>
            ) : (
              <>
                {hasSubscription && (
                  <Button
                    onClick={() => handleClicked(false)}
                    variant="outline"
                    isLoading={endOfCycleLoading}
                    // disabled={immediateLoading || endOfCycleLoading}
                  >
                    Cancel at end of cycle
                  </Button>
                )}
                <Button
                  variant="destructive"
                  onClick={() => handleClicked(true)}
                  isLoading={immediateLoading}
                  disabled={immediateLoading || endOfCycleLoading}
                >
                  Cancel immediately
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
