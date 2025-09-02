import SmallSpinner from "@/components/general/SmallSpinner";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";

import { Customer } from "@autumn/shared";
import { ToolbarButton } from "@/components/general/table-components/ToolbarButton";
import { Trash } from "lucide-react";
import { DeleteCustomerDialog } from "../customer/components/DeleteCustomer";
import { useCusSearchQuery } from "../hooks/useCusSearchQuery";

export const CustomerRowToolbar = ({
  customer,
}: {
  className?: string;
  customer: Customer;
}) => {
  const { refetch } = useCusSearchQuery();
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <DeleteCustomerDialog
        customer={customer}
        open={deleteOpen}
        setOpen={setDeleteOpen}
        onDelete={async () => {
          await refetch();
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
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
