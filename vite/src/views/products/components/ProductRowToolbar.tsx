import SmallSpinner from "@/components/general/SmallSpinner";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { toast } from "sonner";

import { Product, ProductCounts } from "@autumn/shared";
import { ProductService } from "@/services/products/ProductService";
import { useProductsContext } from "../ProductsContext";
import { ToolbarButton } from "@/components/general/table-components/ToolbarButton";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { UpdateProductDialog } from "../UpdateProduct";
import { CopyDialog } from "./CopyDialog";
import { Copy, Delete, Pen, ArchiveRestore, Archive } from "lucide-react";
import { DeleteProductDialog } from "./DeleteProductDialog";

export const ProductRowToolbar = ({
  isOnboarding = false,
}: {
  className?: string;
  isOnboarding?: boolean;
}) => {
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [copyLoading, setCopyLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const [selectedProduct, setSelectedProduct] = useState(product);
  const [dialogType, setDialogType] = useState<"update" | "copy">("update");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const allCount = productCounts?.all || 0;
  let deleteText = allCount > 0 ? "Archive" : "Delete";
  let DeleteIcon = allCount > 0 ? Archive : Delete;

  if (product.archived) {
    deleteText = "Unarchive";
    DeleteIcon = ArchiveRestore;
  }

  return (
    <>
      <DeleteProductDialog
        product={product}
        open={deleteOpen}
        setOpen={setDeleteOpen}
        productCounts={productCounts}
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
            {!isOnboarding && (
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
            )}
            {!isOnboarding && (
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
            )}
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
                {deleteText}
                {deleteLoading ? (
                  <SmallSpinner />
                ) : (
                  <DeleteIcon size={12} className="text-t3" />
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
