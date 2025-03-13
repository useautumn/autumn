import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FeatureService } from "@/services/FeatureService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { toast } from "sonner";
import { Coupon } from "@autumn/shared";
import { useEnv } from "@/utils/envUtils";
import { useProductsContext } from "../ProductsContext";
import { CouponConfig } from "./CouponConfig";
import { CouponService } from "@/services/products/CouponService";
import { getBackendErr } from "@/utils/genUtils";
import { WarningBox } from "@/components/general/modal-components/WarningBox";

function UpdateCoupon({
  open,
  setOpen,
  selectedCoupon,
  setSelectedCoupon,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  selectedCoupon: Coupon | null;
  setSelectedCoupon: (coupon: Coupon) => void;
}) {
  const [updateLoading, setUpdateLoading] = useState(false);
  const { coupons, mutate } = useProductsContext();

  const env = useEnv();
  const axiosInstance = useAxiosInstance({ env });

  const handleUpdate = async () => {
    setUpdateLoading(true);
    try {
      await CouponService.updateCoupon({
        axiosInstance,
        internalId: selectedCoupon!.internal_id,
        data: selectedCoupon!,
      });
      toast.success("Coupon updated successfully");
      await mutate();
      setOpen(false);
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to update coupon"));
    }
    setUpdateLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogTitle>Update Coupon</DialogTitle>
        <WarningBox>
          Existing customers with this coupon will not be affected
        </WarningBox>

        {selectedCoupon && (
          <CouponConfig coupon={selectedCoupon} setCoupon={setSelectedCoupon} />
        )}

        <DialogFooter>
          <Button
            isLoading={updateLoading}
            onClick={() => handleUpdate()}
            variant="gradientPrimary"
          >
            Update
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default UpdateCoupon;
