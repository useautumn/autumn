import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { getBackendErr, navigateTo } from "@/utils/genUtils";
import { CreateCustomer, Customer } from "@autumn/shared";
import { useState } from "react";
import { toast } from "sonner";
import { DialogTitle } from "@/components/ui/dialog";
import { DialogContent } from "@/components/ui/dialog";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { CustomerConfig } from "./CustomerConfig";
import { CusService } from "@/services/customers/CusService";
import { useNavigate } from "react-router";
import { useCusQuery } from "../hooks/useCusQuery";

const UpdateCustomerDialog = ({
  selectedCustomer,
  open,
  setOpen,
}: {
  selectedCustomer: Customer;
  open: boolean;
  setOpen: (open: boolean) => void;
}) => {
  // const { cusMutate } = useCustomerContext();
  const { customer: curCustomer, refetch } = useCusQuery();
  const [customer, setCustomer] = useState<CreateCustomer>(curCustomer);

  const [loading, setLoading] = useState(false);
  const env = useEnv();
  const axiosInstance = useAxiosInstance({ env });
  const navigate = useNavigate();

  // useEffect(() => {
  //   setCustomer(selectedCustomer);
  // }, [open]);

  const handleAddClicked = async () => {
    try {
      setLoading(true);
      await CusService.updateCustomer({
        axios: axiosInstance,
        customer_id: selectedCustomer.id || selectedCustomer.internal_id,
        data: {
          id: customer.id || undefined,
          name: customer.name || null,
          email: customer.email || null,
          fingerprint: customer.fingerprint || null,
        },
      });

      toast.success(`Successfully updated customer`);
      setOpen(false);
      await refetch();

      if (customer.id != selectedCustomer.id) {
        navigateTo(`/customers/${customer.id}`, navigate, env);
      }
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
