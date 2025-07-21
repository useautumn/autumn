import SmallSpinner from "@/components/general/SmallSpinner";
import {
  DialogHeader,
  DialogFooter,
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { CusService } from "@/services/customers/CusService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import { getBackendErr } from "@/utils/genUtils";
import { CusProductStatus, FullCusProduct } from "@autumn/shared";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useCustomerContext } from "../CustomerContext";

export const UpdateStatusDropdownBtn = ({
  cusProduct,
}: {
  cusProduct: FullCusProduct;
}) => {
  const [loading, setLoading] = useState(false);
  const [showDefaultWarning, setShowDefaultWarning] = useState(false);
  const { env, cusMutate } = useCustomerContext();
  const axiosInstance = useAxiosInstance({ env });

  const handleStatusUpdate = async () => {
    setLoading(true);
    try {
      await CusService.updateCusProductStatus(axiosInstance, cusProduct.id, {
        status: CusProductStatus.Expired,
      });
      await cusMutate();
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to update status"));
    }
    setLoading(false);
  };

  const handleExpireClick = () => {
    // Check if this is the expired status and if the product is default
    if (cusProduct.product?.is_default) {
      setShowDefaultWarning(true);
    } else {
      handleStatusUpdate();
    }
  };

  return (
    <>
      <Dialog open={showDefaultWarning} onOpenChange={setShowDefaultWarning}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Expire Default Product</DialogTitle>
          </DialogHeader>
          <div className="">
            <p className="text-sm text-gray-600">
              This is the default product. Expiring it will reattach it to the
              customer and reset their features.
            </p>
          </div>
          <DialogFooter>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowDefaultWarning(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setShowDefaultWarning(false);
                  handleStatusUpdate();
                }}
              >
                Expire Default
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Button
        variant="ghost"
        dim={5}
        size="sm"
        className="p-2 h-full w-full flex justify-between"
        onClick={handleExpireClick}
      >
        {loading ? (
          <SmallSpinner />
        ) : (
          <>
            <span>Expire</span>
          </>
        )}
      </Button>
    </>
  );
};
