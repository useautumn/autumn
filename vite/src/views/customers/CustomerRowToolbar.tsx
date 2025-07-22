import SmallSpinner from "@/components/general/SmallSpinner";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { toast } from "sonner";

import { Customer } from "@autumn/shared";
import { useCustomersContext } from "./CustomersContext";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { ToolbarButton } from "@/components/general/table-components/ToolbarButton";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { Trash } from "lucide-react";
import { CusService } from "@/services/customers/CusService";

export const CustomerRowToolbar = ({
  customer,
}: {
  className?: string;
  customer: Customer;
}) => {
  const { mutate, env } = useCustomersContext();
  const axiosInstance = useAxiosInstance({ env });
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

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
    setDeleteOpen(false);
  };

  return (
    <Dialog open={modalOpen} onOpenChange={setModalOpen}>
      <DropdownMenu open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DropdownMenuTrigger asChild>
          <ToolbarButton />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="text-t2" align="end">
          <DropdownMenuItem
            className="flex items-center text-xs"
            onClick={async (e) => {
              e.stopPropagation();
              e.preventDefault();
              await handleDelete();
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
    </Dialog>
  );
};
