import { SelectContent } from "@/components/ui/select";
import { SelectValue } from "@/components/ui/select";
import { SelectTrigger } from "@/components/ui/select";
import { DialogFooter } from "@/components/ui/dialog";
import { Reward } from "@autumn/shared";
import { Select, SelectItem } from "@/components/ui/select";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useCustomerContext } from "../CustomerContext";

const AddCouponDialogContent = ({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
}) => {
  const { coupons } = useCustomerContext();
  const [couponSelected, setCouponSelected] = useState<Reward | null>(null);

  const handleAddClicked = async () => {};

  return (
    <DialogContent>
      <DialogTitle>Add Reward</DialogTitle>
      <div>
        <Select
          value={couponSelected?.internal_id}
          onValueChange={(value) => {
            const coupon = coupons.find((c: Reward) => c.internal_id === value);
            if (coupon) {
              setCouponSelected(coupon);
            }
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select Reward" />
          </SelectTrigger>
          <SelectContent>
            {coupons.map((coupon: Reward) => (
              <SelectItem key={coupon.internal_id} value={coupon.internal_id}>
                {coupon.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button variant="gradientPrimary" onClick={() => handleAddClicked()}>
          Add Reward
        </Button>
      </DialogFooter>
    </DialogContent>
  );
};

export default AddCouponDialogContent;
