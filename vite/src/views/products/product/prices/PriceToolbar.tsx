import SmallSpinner from "@/components/general/SmallSpinner";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { Price } from "@autumn/shared";
import { PriceService } from "@/services/products/PriceService";
import { useNavigate } from "react-router";
import { useProductContext } from "../ProductContext";
import { cn } from "@/lib/utils";
import { Delete, EllipsisVertical } from "lucide-react";

export const PriceToolbar = ({
  className,
  price,
}: {
  className?: string;
  price: Price;
}) => {
  const navigate = useNavigate();
  const { mutate, env } = useProductContext();

  const axiosInstance = useAxiosInstance({ env });
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await PriceService.deletePrice(axiosInstance, price.id!);
      await mutate();
      console.log("Price deleted");
      toast.success("Price deleted");
    } catch (error) {
      toast.error("Failed to delete price");
    }
    setDeleteLoading(false);
    setDeleteOpen(false);
  };

  return (
    <DropdownMenu open={deleteOpen} onOpenChange={setDeleteOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          isIcon
          variant="ghost"
          dim={6}
          className={cn("rounded-full", className)}
        >
          <EllipsisVertical size={12} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="text-t2">
        <DropdownMenuItem
          className="flex items-center"
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
              <Delete size={12} className="text-t3" />
            )}
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
