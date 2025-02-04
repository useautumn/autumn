import {
  DialogTrigger,
  DialogTitle,
  DialogHeader,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { DialogContent } from "@/components/ui/dialog";
import { Dialog } from "@/components/ui/dialog";
import { FullCustomerEntitlement } from "@autumn/shared";
import React, { useEffect, useState } from "react";
import { useCustomerContext } from "../CustomerContext";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { DateInputUnix } from "@/components/general/DateInputUnix";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { CusService } from "@/services/customers/CusService";
import { toast } from "react-hot-toast";
import { getBackendErr } from "@/utils/genUtils";

function UpdateCusEntitlement({
  selectedCusEntitlement,
  setSelectedCusEntitlement,
}: {
  selectedCusEntitlement: FullCustomerEntitlement | null;
  setSelectedCusEntitlement: (cusEnt: FullCustomerEntitlement | null) => void;
}) {
  // Get customer product
  const { customer, env, cusMutate } = useCustomerContext();
  const axiosInstance = useAxiosInstance({ env });

  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateFields, setUpdateFields] = useState<any>({
    balance: selectedCusEntitlement?.balance,
    next_reset_at: selectedCusEntitlement?.next_reset_at,
  });

  const getCusProduct = (cusEnt: FullCustomerEntitlement) => {
    const cusProduct = customer.products.find(
      (p: any) => p.id === cusEnt.customer_product_id
    );
    return cusProduct;
  };

  useEffect(() => {
    setUpdateFields({
      balance: selectedCusEntitlement?.balance,
      next_reset_at: selectedCusEntitlement?.next_reset_at,
    });
  }, [selectedCusEntitlement]);

  if (!selectedCusEntitlement) return null;

  const entitlement = selectedCusEntitlement.entitlement;
  const feature = entitlement.feature;
  const cusProduct = getCusProduct(selectedCusEntitlement);

  const handleUpdateCusEntitlement = async (
    cusEnt: FullCustomerEntitlement
  ) => {
    const balanceInt = parseInt(updateFields.balance);
    if (isNaN(balanceInt) || balanceInt < 0) {
      toast.error("Balance must be a positive integer");
      return;
    }

    setUpdateLoading(true);
    try {
      await CusService.updateCusEntitlement(axiosInstance, cusEnt.id, {
        balance: balanceInt,
        next_reset_at: updateFields.next_reset_at,
      });
      toast.success("Entitlement updated successfully");
      await cusMutate();
      setSelectedCusEntitlement(null);
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to update entitlement"));
    }
    setUpdateLoading(false);
  };

  return (
    <Dialog
      open={!!selectedCusEntitlement}
      onOpenChange={() => setSelectedCusEntitlement(null)}
    >
      <DialogTrigger asChild></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {feature.name} - {cusProduct?.product.name}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div>
            <FieldLabel>Balance</FieldLabel>
            <Input
              type="number"
              value={updateFields.balance || ""}
              onChange={(e) => {
                setUpdateFields({
                  ...updateFields,
                  balance: e.target.value,
                });
              }}
            />
          </div>
          <div>
            <FieldLabel>Next Reset</FieldLabel>
            <DateInputUnix
              unixDate={updateFields.next_reset_at}
              setUnixDate={(unixDate) => {
                setUpdateFields({ ...updateFields, next_reset_at: unixDate });
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="gradientPrimary"
            isLoading={updateLoading}
            onClick={() => handleUpdateCusEntitlement(selectedCusEntitlement)}
          >
            Update
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default UpdateCusEntitlement;

// const DateInput = ({
//   value,
//   onChange,
// }: {
//   value: string;
//   onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
// }) => {
//   const [date, setDate] = React.useState<Date>();

//   return (

//   );
// };
