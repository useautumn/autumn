import {
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CusProductStatus, Customer, FullCusProduct } from "@autumn/shared";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { useState } from "react";
import { toast } from "sonner";
import { useCustomerContext } from "../CustomerContext";
import { notNullish } from "@/utils/genUtils";

export const DeleteCustomerDialog = ({
  customer,
  onDelete,
  open,
  setOpen,
}: {
  customer: Customer;
  onDelete: () => Promise<void>;
  open: boolean;
  setOpen: (open: boolean) => void;
}) => {
  const [loading, setLoading] = useState(false);

  const axiosInstance = useAxiosInstance();

  const handleClicked = async () => {
    setLoading(true);

    try {
      await axiosInstance.delete(`/v1/customers/${customer.id}`);
      await onDelete();
      setOpen(false);
      toast.success("Customer deleted");
    } catch (error) {
      toast.error("Failed to delete customer");
    } finally {
      setLoading(false);
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
            Are you sure you want to delete this customer? This action cannot be
            undone.
          </p>
        </div>

        <DialogFooter>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              onClick={() => handleClicked()}
              isLoading={loading}
            >
              Delete customer
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
