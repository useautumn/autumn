import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { DialogTrigger } from "@/components/ui/dialog";
import { AppEnv, Product } from "@autumn/shared";
import { useProductsContext } from "../ProductsContext";
import { Skeleton } from "@/components/ui/skeleton";
import { useAxiosSWR } from "@/services/useAxiosSwr";
import { useState } from "react";
import { ProductService } from "@/services/products/ProductService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { ToggleButton } from "@/components/general/ToggleButton";
import { useEnv } from "@/utils/envUtils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getBackendErr } from "@/utils/genUtils";
import { toast } from "sonner";

export const DeleteProductDialog = ({
  product,
  open,
  setOpen,
}: {
  product: Product;
  open: boolean;
  setOpen: (open: boolean) => void;
}) => {
  const { mutate } = useProductsContext();
  const [deleteLoading, setDeleteLoading] = useState(false);
  const axiosInstance = useAxiosInstance();
  const env = useEnv();

  const { data: productInfo, isLoading } = useAxiosSWR({
    url: `/products/${product.id}/info`,
    options: {
      refreshInterval: 0,
    },
  });

  const [deleteAllVersions, setDeleteAllVersions] = useState(false);

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await ProductService.deleteProduct(
        axiosInstance,
        product.id,
        deleteAllVersions
      );
      await mutate();
      setOpen(false);
    } catch (error) {
      console.error("Error deleting product:", error);
      toast.error(getBackendErr(error, "Error deleting product"));
    } finally {
      setDeleteLoading(false);
    }
  };

  const hasCusProductsAll = productInfo?.hasCusProducts;
  const hasCusProductsLatest = productInfo?.hasCusProductsLatest;

  const hasCusProducts = deleteAllVersions
    ? hasCusProductsAll
    : hasCusProductsLatest;

  const getDeleteMessage = () => {
    if (env == AppEnv.Live) {
      if (hasCusProducts) {
        return "There are customers on this product. Please delete them first before deleting the product.";
      } else {
        return "Are you sure you want to delete this product? This action cannot be undone.";
      }
    } else {
      if (hasCusProducts) {
        return "There are customers on this product. Deleting this product will remove it from any customers. Are you sure you want to continue?";
      } else {
        return "Are you sure you want to delete this product? This action cannot be undone.";
      }
    }
    // let message = "Are you sure you want to delete this product?";
    // if (hasCusProducts) {
    //   message += " This product has customers on it (including expired).";
    // }
    // return message;
  };

  if (!productInfo) {
    return <></>;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Delete {product.name}</DialogTitle>
        </DialogHeader>

        {productInfo.numVersion > 1 && (
          <Select
            value={deleteAllVersions ? "all" : "latest"}
            onValueChange={(value) => setDeleteAllVersions(value === "all")}
          >
            <SelectTrigger className="w-6/12">
              <SelectValue placeholder="Select a version" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="latest">Delete latest version</SelectItem>
              <SelectItem value="all">Delete all versions</SelectItem>
            </SelectContent>
          </Select>
        )}

        <div className="flex text-t2 text-sm">
          <p>
            {/* {hasCusProducts &&
              "This product has customers on it (including expired)."} */}
            {getDeleteMessage()}
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="destructive"
            onClick={handleDelete}
            isLoading={deleteLoading}
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
