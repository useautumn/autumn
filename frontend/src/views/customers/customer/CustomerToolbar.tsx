import SmallSpinner from "@/components/general/SmallSpinner";
import { faEllipsisVertical, faTrash } from "@fortawesome/pro-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { cn } from "@nextui-org/theme";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { Reward, Customer } from "@autumn/shared";
import { useCustomerContext } from "./CustomerContext";
import { CusService } from "@/services/customers/CusService";
import { useRouter } from "next/navigation";
import { faCog, faTicket } from "@fortawesome/pro-duotone-svg-icons";
import { navigateTo } from "@/utils/genUtils";

import React from "react";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import AddCouponDialogContent from "./add-coupon/AddCouponDialogContent";

export const CustomerToolbar = ({
  className,
  customer,
}: {
  className?: string;
  customer: Customer;
}) => {
  const router = useRouter();
  const { mutate, env, addCouponOpen, setAddCouponOpen } = useCustomerContext();

  const axiosInstance = useAxiosInstance({ env });
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await CusService.deleteCustomer(axiosInstance, customer.id);
      navigateTo("/customers", router, env);
    } catch (error) {
      toast.error("Failed to delete customer");
    }
    setDeleteLoading(false);
    setDeleteOpen(false);
  };

  return (
    <React.Fragment>
      <Dialog open={addCouponOpen} onOpenChange={setAddCouponOpen}>
        <DialogTrigger asChild></DialogTrigger>
        <AddCouponDialogContent
          open={addCouponOpen}
          setOpen={setAddCouponOpen}
        />
        <DropdownMenu open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              isIcon
              variant="ghost"
              dim={6}
              className={cn("rounded-full", className)}
            >
              <FontAwesomeIcon icon={faCog} size="lg" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="text-t2 w-[150px]" align="end">
            <DialogTrigger className="w-full">
              <DropdownMenuItem
                onClick={(e) => {
                  setAddCouponOpen(true);
                }}
              >
                <div className="flex text-sm items-center justify-between w-full gap-2">
                  <p className="text-t2">Add Reward</p>
                  <FontAwesomeIcon icon={faTicket} size="sm" />
                </div>
              </DropdownMenuItem>
            </DialogTrigger>
            <DropdownMenuItem
              className="flex items-center text-red-500 hover:!bg-red-500 hover:!text-white"
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
                  <FontAwesomeIcon icon={faTrash} size="sm" />
                )}
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Dialog>
    </React.Fragment>
  );
};
