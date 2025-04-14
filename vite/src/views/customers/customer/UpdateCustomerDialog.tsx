import { DialogFooter } from "@/components/ui/dialog";

import { getOriginalCouponId } from "@/utils/product/couponUtils";
import { getBackendErr } from "@/utils/genUtils";
import { Reward, CreateCustomer, Customer } from "@autumn/shared";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DialogTitle } from "@/components/ui/dialog";
import { DialogContent } from "@/components/ui/dialog";
import { SelectContent, SelectItem } from "@/components/ui/select";
import { WarningBox } from "@/components/general/modal-components/WarningBox";
import { SelectValue } from "@/components/ui/select";
import { SelectTrigger } from "@/components/ui/select";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useCustomerContext } from "./CustomerContext";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { CustomerConfig } from "./CustomerConfig";
import { CusService } from "@/services/customers/CusService";

const UpdateCustomerDialog = ({
  selectedCustomer,
  open,
  setOpen,
}: {
  selectedCustomer: Customer;
  open: boolean;
  setOpen: (open: boolean) => void;
}) => {
  const { cusMutate } = useCustomerContext();
  const [couponSelected, setCouponSelected] = useState<Reward | null>(null);
  const [customer, setCustomer] = useState<CreateCustomer>(selectedCustomer);
  const [loading, setLoading] = useState(false);
  const env = useEnv();
  const axiosInstance = useAxiosInstance({ env });

  useEffect(() => {
    setCustomer(selectedCustomer);
  }, [open]);

  const handleAddClicked = async () => {
    try {
      setLoading(true);
      await CusService.updateCustomer({
        axios: axiosInstance,
        customer_id: selectedCustomer.id || selectedCustomer.internal_id,
        data: customer,
      });

      toast.success(`Successfully updated customer`);
      setOpen(false);
      await cusMutate();
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to update customer"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <DialogContent className="w-md">
      <DialogTitle>Update Customer</DialogTitle>

      <CustomerConfig
        customer={customer}
        setCustomer={setCustomer}
        isUpdate={true}
      />

      <DialogFooter>
        <Button
          variant="gradientPrimary"
          onClick={() => handleAddClicked()}
          isLoading={loading}
        >
          Update
        </Button>
      </DialogFooter>
    </DialogContent>
  );
};

export default UpdateCustomerDialog;
