import SmallSpinner from "@/components/general/SmallSpinner";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

import { Product } from "@autumn/shared";

import { ProductService } from "@/services/products/ProductService";
import { useNavigate } from "react-router";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useProductContext } from "./ProductContext";
import { navigateTo } from "@/utils/genUtils";
import { Delete, Settings } from "lucide-react";

export const EditProductToolbar = ({
  className,
  product,
}: {
  className?: string;
  product: Product;
}) => {
  const { mutate, env } = useProductContext();
  const axiosInstance = useAxiosInstance({ env });

  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const navigate = useNavigate();

  const handleDelete = async () => {
    try {
      setDeleteLoading(true);
      await ProductService.deleteProduct(axiosInstance, product.id);
      navigateTo("/products", navigate, env);
    } catch (error) {
      toast.error("Failed to delete product");
    } finally {
      setDeleteLoading(false);
    }
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
          <Settings size={14} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="text-t2">
        <DropdownMenuItem
          className="flex items-center bg-red-500 text-white"
          onClick={async (e) => {
            e.stopPropagation();
            e.preventDefault();
            await handleDelete();
          }}
        >
          <div className="flex items-center justify-between w-full gap-2">
            Delete
            {deleteLoading ? <SmallSpinner /> : <Delete size={12} />}
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
