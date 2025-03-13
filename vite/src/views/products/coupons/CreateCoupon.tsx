import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { SelectContent } from "@/components/ui/select";
import { SelectTrigger, SelectValue } from "@/components/ui/select";
import { SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import React, { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { FeatureService } from "@/services/FeatureService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { toast } from "sonner";
import { PlusIcon } from "lucide-react";
import {
  CouponDurationType,
  CreateCoupon as CreateCouponType,
  DiscountType,
} from "@autumn/shared";
import { getBackendErr } from "@/utils/genUtils";
import { useProductsContext } from "../ProductsContext";

import { CouponConfig } from "./CouponConfig";
import { CouponService } from "@/services/products/CouponService";

const defaultCoupon: CreateCouponType = {
  name: "",
  promo_codes: [{ code: "" }],
  price_ids: [],
  discount_type: DiscountType.Fixed,
  discount_value: 0,
  duration_type: CouponDurationType.Months,
  duration_value: 0,
  should_rollover: true,
  apply_to_all: true,
};

function CreateCoupon() {
  const { mutate, env } = useProductsContext();
  const axiosInstance = useAxiosInstance({ env: env });

  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const [coupon, setCoupon] = useState(defaultCoupon);

  useEffect(() => {
    if (open) {
      setCoupon(defaultCoupon);
    }
  }, [open]);

  const handleCreate = async () => {
    setIsLoading(true);
    try {
      await CouponService.createCoupon({
        axiosInstance,
        data: coupon,
      });

      await mutate();
      setOpen(false);
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to create credit system"));
    }
    setIsLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="dashed"
          className="w-full"
          startIcon={<PlusIcon size={15} />}
        >
          Create Coupon
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Coupon</DialogTitle>
        </DialogHeader>
        {/* <CreditSystemConfig
          creditSystem={creditSystem}
          setCreditSystem={setCreditSystem}
        /> */}
        <CouponConfig coupon={coupon} setCoupon={setCoupon} />
        <DialogFooter>
          <Button
            onClick={handleCreate}
            isLoading={isLoading}
            variant="gradientPrimary"
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CreateCoupon;
