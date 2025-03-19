import SmallSpinner from "@/components/general/SmallSpinner";
import { faClone, faPencil, faTrash } from "@fortawesome/pro-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { toast } from "sonner";

import { AppEnv, Product } from "@autumn/shared";
import { ProductService } from "@/services/products/ProductService";
import { useProductsContext } from "./ProductsContext";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { ToolbarButton } from "@/components/general/table-components/ToolbarButton";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { UpdateProductDialog } from "./UpdateProduct";
import { CopyDialog } from "./CopyDialog";

export const ProductRowToolbar = ({
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
  const [modalOpen, setModalOpen] = useState(false);

  const [selectedProduct, setSelectedProduct] = useState(product);
  const [dialogType, setDialogType] = useState<"update" | "copy">("update");

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

  return (
    <Dialog open={modalOpen} onOpenChange={setModalOpen}>
      {dialogType == "update" ? (
        <UpdateProductDialog
          selectedProduct={product}
          setSelectedProduct={setSelectedProduct}
          setModalOpen={setModalOpen}
          setDropdownOpen={setDeleteOpen}
        />
      ) : (
        <CopyDialog product={selectedProduct} setModalOpen={setModalOpen} />
      )}
      <DropdownMenu open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DropdownMenuTrigger asChild>
          <ToolbarButton />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="text-t2" align="end">
          <DialogTrigger asChild>
            <DropdownMenuItem
              className="flex items-center text-xs"
              onClick={async (e) => {
                e.stopPropagation();
                e.preventDefault();
                setSelectedProduct(product);
                setDialogType("copy");
                setModalOpen(true);
                // await handleCopy();
              }}
            >
              <div className="flex items-center justify-between w-full gap-2">
                Copy
                {copyLoading ? (
                  <SmallSpinner />
                ) : (
                  <FontAwesomeIcon icon={faClone} size="sm" />
                )}
              </div>
            </DropdownMenuItem>
          </DialogTrigger>
          <DialogTrigger asChild>
            <DropdownMenuItem
              className="flex items-center text-xs"
              onClick={async (e) => {
                e.stopPropagation();
                e.preventDefault();
                setSelectedProduct(product);
                setDialogType("update");
                setModalOpen(true);
              }}
            >
              <div className="flex items-center justify-between w-full gap-2">
                Edit
                <FontAwesomeIcon icon={faPencil} size="sm" />
              </div>
            </DropdownMenuItem>
          </DialogTrigger>
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

          {/* {env == AppEnv.Sandbox && (
            
          )} */}
        </DropdownMenuContent>
      </DropdownMenu>
    </Dialog>
  );
};
