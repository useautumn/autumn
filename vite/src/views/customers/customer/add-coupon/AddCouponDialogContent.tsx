import { SelectContent } from "@/components/ui/select";
import { SelectValue } from "@/components/ui/select";
import { SelectTrigger } from "@/components/ui/select";
import { DialogFooter } from "@/components/ui/dialog";
import { Coupon } from "@autumn/shared";
import { Select, SelectItem } from "@/components/ui/select";
import { DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useCustomerContext } from "../CustomerContext";

const AddCouponDialogContent = () => {
  const { coupons } = useCustomerContext();
  const [couponSelected, setCouponSelected] = useState<Coupon | null>(null);

  const handleAddClicked = async () => {};

  return (
    <DialogContent>
      <DialogTitle>Add Coupon</DialogTitle>
      <div>
        <Select
          value={couponSelected?.internal_id}
          onValueChange={(value) => {
            const coupon = coupons.find((c: Coupon) => c.internal_id === value);
            if (coupon) {
              setCouponSelected(coupon);
            }
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select Coupon" />
          </SelectTrigger>
          <SelectContent>
            {coupons.map((coupon: Coupon) => (
              <SelectItem key={coupon.internal_id} value={coupon.internal_id}>
                {coupon.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button variant="gradientPrimary" onClick={() => handleAddClicked()}>
          Add Coupon
        </Button>
      </DialogFooter>
    </DialogContent>
  );
};

export default AddCouponDialogContent;
