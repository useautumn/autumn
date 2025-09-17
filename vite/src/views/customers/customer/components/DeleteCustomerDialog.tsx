import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Customer } from "@autumn/shared";
import { Button } from "@/components/ui/button";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useState } from "react";
import { toast } from "sonner";
import { useEnv } from "@/utils/envUtils";
import { useCusSearchQuery } from "../../hooks/useCusSearchQuery";

export const DeleteCustomerDialog = ({
  customer,
  open,
  setOpen,
}: {
  customer: Customer;
  open: boolean;
  setOpen: (open: boolean) => void;
}) => {
  const [loadingStates, setLoadingStates] = useState({
    deleteStripe: false,
    deleteCustomer: false,
  });
  const { refetch } = useCusSearchQuery();

  const axiosInstance = useAxiosInstance();

  const handleClicked = async ({
    deleteStripe = false,
  }: {
    deleteStripe?: boolean;
  }) => {
    setLoadingStates({
      deleteStripe: deleteStripe,
      deleteCustomer: !deleteStripe,
    });

    try {
      await axiosInstance.delete(
        `/v1/customers/${customer.id || customer.internal_id}?delete_in_stripe=${deleteStripe}`
      );

      await refetch();
      setOpen(false);
      toast.success("Customer deleted");
    } catch (error) {
      toast.error("Failed to delete customer");
    } finally {
      setLoadingStates({
        deleteStripe: false,
        deleteCustomer: false,
      });
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Delete Customer</DialogTitle>
        </DialogHeader>

        <div className="mb-2 text-sm">
          <p className="text-t2">
            Are you sure you want to delete this customer in Autumn? This action
            cannot be undone. Select whether to delete this customer in Stripe
            as well.
          </p>
        </div>

        <DialogFooter>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => handleClicked({ deleteStripe: false })}
              isLoading={loadingStates.deleteCustomer}
              disabled={loadingStates.deleteStripe}
            >
              Delete in Autumn only
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleClicked({ deleteStripe: true })}
              isLoading={loadingStates.deleteStripe}
              disabled={loadingStates.deleteCustomer}
            >
              Delete in Autumn and Stripe
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
