import SmallSpinner from "@/components/general/SmallSpinner";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { toast } from "sonner";

import { Product } from "@autumn/shared";
import { ProductService } from "@/services/products/ProductService";
import { useProductsContext } from "../ProductsContext";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { ToolbarButton } from "@/components/general/table-components/ToolbarButton";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { UpdateProductDialog } from "../UpdateProduct";
import { CopyDialog } from "./CopyDialog";
import { Copy, Delete, Pen, ArchiveRestore } from "lucide-react";
import { DeleteProductDialog } from "./DeleteProductDialog";

export const ProductRowToolbar = ({
  product,
}: {
  className?: string;
  product: Product;
}) => {
  const { mutate, env } = useProductsContext();
  const axiosInstance = useAxiosInstance({ env });
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [copyLoading, setCopyLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const [selectedProduct, setSelectedProduct] = useState(product);
  const [dialogType, setDialogType] = useState<"update" | "copy">("update");
  const [deleteOpen, setDeleteOpen] = useState(false);

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
    <>
      <DeleteProductDialog
        product={product}
        open={deleteOpen}
        setOpen={setDeleteOpen}
      />
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
        <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
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
                }}
              >
                <div className="flex items-center justify-between w-full gap-2">
                  Copy
                  {copyLoading ? (
                    <SmallSpinner />
                  ) : (
                    <Copy size={12} className="text-t3" />
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
                  <Pen size={12} className="text-t3" />
                </div>
              </DropdownMenuItem>
            </DialogTrigger>
            <DropdownMenuItem
              className="flex items-center text-xs"
              onClick={async (e) => {
                e.stopPropagation();
                e.preventDefault();
                setDropdownOpen(false);
                setDeleteOpen(true);
              }}
            >
              <div className="flex items-center justify-between w-full gap-2">
                {product.archived ? 'Unarchive' : 'Delete'}
                {deleteLoading ? (
                  <SmallSpinner />
                ) : product.archived ? (
                  <ArchiveRestore size={12} className="text-t3" />
                ) : (
                  <Delete size={12} className="text-t3" />
                )}
              </div>
            </DropdownMenuItem>

            {/* {env == AppEnv.Sandbox && (
            
          )} */}
          </DropdownMenuContent>
        </DropdownMenu>
      </Dialog>
    </>
  );
};
