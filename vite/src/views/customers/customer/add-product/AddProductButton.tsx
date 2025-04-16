import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useProductContext } from "@/views/products/product/ProductContext";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProductActionState } from "@/utils/models";
import { File, ShoppingCart, Upload } from "lucide-react";

export const AddProductButton = ({}: // setUseInvoice,
{
  // setUseInvoice?: (useInvoice: boolean) => void;
  // handleCreateProduct: (useInvoice?: boolean) => Promise<void>;
  // actionState: any;
}) => {
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const { handleCreateProduct, actionState, setUseInvoice } =
    useProductContext();

  const handleClick = async (e: any, isInvoice: boolean) => {
    e.preventDefault();
    e.stopPropagation();

    if (isInvoice) {
      setInvoiceLoading(true);
    } else {
      setCheckoutLoading(true);
    }
    if (setUseInvoice) {
      setUseInvoice(isInvoice);
    }

    await handleCreateProduct(isInvoice);

    if (isInvoice) {
      setInvoiceLoading(false);
    } else {
      setCheckoutLoading(false);
    }
    setOpen(false);
  };

  const [loading, setLoading] = useState(false);

  if (
    !setUseInvoice ||
    actionState.state === ProductActionState.UpdateOptionsOnly
  ) {
    return (
      <Button
        onClick={async () => {
          setLoading(true);
          await handleCreateProduct(false);
          setLoading(false);
        }}
        variant="gradientPrimary"
        className="w-full gap-2"
        isLoading={loading}
        disabled={actionState.disabled}
        startIcon={<Upload size={12} />}
      >
        {actionState.buttonText}
      </Button>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                onClick={() => setOpen(true)}
                variant="gradientPrimary"
                className="w-full gap-2"
                startIcon={<Upload size={12} />}
                disabled={actionState.disabled}
              >
                {actionState.buttonText}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">{actionState.tooltipText}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DropdownMenuContent>
        <DropdownMenuItem
          isLoading={checkoutLoading}
          onClick={(e) => handleClick(e, false)}
          className="h-8 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <ShoppingCart size={12} className="text-t3" />

            <p className="text-xs text-t2">Checkout</p>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem
          isLoading={invoiceLoading}
          onClick={(e) => handleClick(e, true)}
          className="h-8 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <File size={12} className="text-t3" />
            <p className="text-xs text-t2">Invoice</p>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
