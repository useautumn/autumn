import SmallSpinner from "@/components/general/SmallSpinner";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { toast } from "sonner";

import { AppEnv, Customer } from "@autumn/shared";
import { useCustomersContext } from "./CustomersContext";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { ToolbarButton } from "@/components/general/table-components/ToolbarButton";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { Trash } from "lucide-react";
import { CusService } from "@/services/customers/CusService";
import { DeleteCustomerDialog } from "./customer/components/DeleteCustomer";
import { useEnv } from "@/utils/envUtils";

export const CustomerRowToolbar = ({
  customer,
}: {
  className?: string;
  customer: Customer;
}) => {
  const { mutate } = useCustomersContext();
  const axiosInstance = useAxiosInstance();
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const env = useEnv();

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await CusService.deleteCustomer(axiosInstance, customer.id);
      await mutate();
    } catch (error) {
      console.log("Error deleting customer", error);
      toast.error(getBackendErr(error, "Failed to delete customer"));
    }
    setDeleteLoading(false);
    setDropdownOpen(false);
  };

  return (
    <>
      <DeleteCustomerDialog
        customer={customer}
        open={deleteOpen}
        setOpen={setDeleteOpen}
        onDelete={async () => {
          await mutate();
        }}
      />

      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <ToolbarButton />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="text-t2" align="end">
          <DropdownMenuItem
            className="flex items-center text-xs"
            onClick={async (e) => {
              e.stopPropagation();
              e.preventDefault();
              setDeleteOpen(true);
              setDropdownOpen(false);
            }}
          >
            <div className="flex items-center justify-between w-full gap-2">
              Delete
              {deleteLoading ? (
                <SmallSpinner />
              ) : (
                <Trash size={12} className="text-t3" />
              )}
            </div>
          </DropdownMenuItem>

          {/* {env == AppEnv.Sandbox && (
            
          )} */}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
