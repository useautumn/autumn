import {
  DialogTrigger,
  DialogTitle,
  DialogHeader,
  DialogFooter,
} from "@/components/ui/dialog";
import { DialogContent } from "@/components/ui/dialog";
import { Dialog } from "@/components/ui/dialog";
import { FullCustomerEntitlement } from "@autumn/shared";
import { useEffect, useState } from "react";
import { useCustomerContext } from "../CustomerContext";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Input } from "@/components/ui/input";

import { Button } from "@/components/ui/button";

import { DateInputUnix } from "@/components/general/DateInputUnix";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { CusService } from "@/services/customers/CusService";
import { toast } from "sonner";
import { getBackendErr, notNullish } from "@/utils/genUtils";
import CopyButton from "@/components/general/CopyButton";

function UpdateCusEntitlement({
  selectedCusEntitlement,
  setSelectedCusEntitlement,
}: {
  selectedCusEntitlement: FullCustomerEntitlement | null;
  setSelectedCusEntitlement: (cusEnt: FullCustomerEntitlement | null) => void;
}) {
  // Get customer product
  const { customer, env, cusMutate, entityId } = useCustomerContext();
  const axiosInstance = useAxiosInstance({ env });

  const [updateLoading, setUpdateLoading] = useState(false);

  let cusEnt = selectedCusEntitlement;

  const [updateFields, setUpdateFields] = useState<any>({
    balance:
      entityId && notNullish(cusEnt?.entities?.[entityId]?.balance)
        ? cusEnt?.entities?.[entityId]?.balance
        : cusEnt?.balance,
    next_reset_at: cusEnt?.next_reset_at,
  });

  const getCusProduct = (cusEnt: FullCustomerEntitlement) => {
    const cusProduct = customer.products.find(
      (p: any) => p.id === cusEnt.customer_product_id
    );
    return cusProduct;
  };

  useEffect(() => {
    setUpdateFields({
      balance:
        entityId && notNullish(cusEnt?.entities?.[entityId]?.balance)
          ? cusEnt?.entities?.[entityId]?.balance
          : cusEnt?.balance,
      next_reset_at: cusEnt?.next_reset_at,
    });
  }, [selectedCusEntitlement]);

  if (!selectedCusEntitlement) return null;

  const entitlement = selectedCusEntitlement.entitlement;
  const feature = entitlement.feature;
  const cusProduct = getCusProduct(selectedCusEntitlement);

  const handleUpdateCusEntitlement = async (
    cusEnt: FullCustomerEntitlement
  ) => {
    const balanceInt = parseFloat(updateFields.balance);
    if (isNaN(balanceInt)) {
      toast.error("Balance not valid");
      return;
    }

    setUpdateLoading(true);
    try {
      await CusService.updateCusEntitlement(axiosInstance, cusEnt.id, {
        balance: balanceInt,
        next_reset_at: updateFields.next_reset_at,
        entity_id: entityId,
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
      <DialogContent className="min-w-sm">
        <DialogHeader>
          <div className="flex flex-col gap-4">
            <DialogTitle>{feature.name}</DialogTitle>
            <CopyButton text={feature.id} className="w-fit font-mono">
              {feature.id}
            </CopyButton>
          </div>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div>
            <FieldLabel>Balance</FieldLabel>
            <Input
              type="number"
              value={
                notNullish(updateFields.balance) ? updateFields.balance : ""
              }
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
