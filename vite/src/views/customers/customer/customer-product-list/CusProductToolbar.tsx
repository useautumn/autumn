import { ToolbarButton } from "@/components/general/table-components/ToolbarButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CusProductStatus, FullCusProduct } from "@autumn/shared";
import { UpdateStatusDropdownBtn } from "./UpdateStatusDropdownBtn";
import { useState } from "react";
import { useCustomerContext } from "../CustomerContext";
import { TransferProductDialog } from "./TransferProductDialog";
import { ArrowLeftRight, ArrowRightFromLine, Delete } from "lucide-react";
import { CancelProductDialog } from "./CancelProductDialog";

export const CusProductToolbar = ({
  cusProduct,
}: {
  cusProduct: FullCusProduct;
}) => {
  const { showEntityView } = useCustomerContext();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  return (
    <>
      <TransferProductDialog
        cusProduct={cusProduct}
        open={transferOpen}
        setOpen={setTransferOpen}
      />
      <CancelProductDialog
        cusProduct={cusProduct}
        open={cancelOpen}
        setOpen={setCancelOpen}
      />
      <DropdownMenu open={dialogOpen} onOpenChange={setDialogOpen}>
        <DropdownMenuTrigger asChild>
          <ToolbarButton className="!w-4 !h-6 !rounded-md text-t3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="text-t2 w-36" align="end">
          {showEntityView && (
            <DropdownMenuItem
              className="flex items-center justify-between w-full text-t2"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setTransferOpen(true);
                setDialogOpen(false);
              }}
            >
              <p>Transfer</p>
              <ArrowLeftRight width={14} className="text-t3" />
            </DropdownMenuItem>
          )}

          <DropdownMenuItem
            className="flex items-center justify-between w-full text-t2"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setCancelOpen(true);
              setDialogOpen(false);
            }}
          >
            <p>Cancel</p>
            <Delete width={14} className="text-t3" />
            {/* <ArrowRightFromLine width={14} className="text-t3" /> */}
            {/* <UpdateStatusDropdownBtn cusProduct={cusProduct} /> */}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
