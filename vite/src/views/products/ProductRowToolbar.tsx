import SmallSpinner from "@/components/general/SmallSpinner";
import {
  faClone,
  faEllipsisVertical,
  faTrash,
} from "@fortawesome/pro-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
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

import { AppEnv, Product } from "@autumn/shared";
import { ProductService } from "@/services/products/ProductService";
import { useProductsContext } from "./ProductsContext";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { ToolbarButton } from "@/components/general/table-components/ToolbarButton";

export const ProductRowToolbar = ({
  className,
  product,
}: {
  className?: string;
  product: Product;
}) => {
  const { mutate, env } = useProductsContext();
  const axiosInstance = useAxiosInstance({ env });
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [copyLoading, setCopyLoading] = useState(false);
  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await ProductService.deleteProduct(axiosInstance, product.id);
      await mutate();
    } catch (error) {
      console.log("Error deleting product", error);
      toast.error(getBackendErr(error, "Failed to delete product"));
    }
    setDeleteLoading(false);
    setDeleteOpen(false);
  };

  const handleCopy = async () => {
    setCopyLoading(true);
    try {
      await ProductService.copyProduct(axiosInstance, product.id);
      toast.success("Successfully copied product");
    } catch (error) {
      console.log("Error copying product", error);
      toast.error(getBackendErr(error, "Failed to copy product"));
    }
    setCopyLoading(false);
  };

  return (
    <DropdownMenu open={deleteOpen} onOpenChange={setDeleteOpen}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="text-t2">
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
              <FontAwesomeIcon icon={faTrash} size="sm" />
            )}
          </div>
        </DropdownMenuItem>
        {env == AppEnv.Sandbox && (
          <DropdownMenuItem
            className="flex items-center text-xs"
            onClick={async (e) => {
              e.stopPropagation();
              e.preventDefault();
              await handleCopy();
            }}
          >
            <div className="flex items-center justify-between w-full gap-2">
              Copy to live
              {copyLoading ? (
                <SmallSpinner />
              ) : (
                <FontAwesomeIcon icon={faClone} size="sm" />
              )}
            </div>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
