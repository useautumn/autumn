import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileInvoiceDollar } from "@fortawesome/pro-duotone-svg-icons";
import { useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { faCartShopping } from "@fortawesome/pro-duotone-svg-icons/faCartShopping";

export const AddProductButton = ({
  setUseInvoice,
  handleCreateProduct,
  actionState,
}: {
  setUseInvoice?: (useInvoice: boolean) => void;
  handleCreateProduct: (useInvoice?: boolean) => Promise<void>;
  actionState: any;
}) => {
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [open, setOpen] = useState(false);

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

  if (!setUseInvoice) {
    return (
      <Button
        onClick={async () => {
          setLoading(true);
          await handleCreateProduct(false);
          setLoading(false);
        }}
        variant="gradientPrimary"
        className="w-fit gap-2"
        isLoading={loading}
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
                className="w-fit gap-2"
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
            <FontAwesomeIcon
              icon={faCartShopping}
              size="xs"
              className="!h-3 w-3"
            />
            <p className="text-xs text-t2">Checkout</p>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem
          isLoading={invoiceLoading}
          onClick={(e) => handleClick(e, true)}
          className="h-8 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <FontAwesomeIcon
              icon={faFileInvoiceDollar}
              size="xs"
              className="!h-3 w-3"
            />
            <p className="text-xs text-t2">Invoice</p>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

{
  /* <div>
            <Button
              onClick={handleClick}
              variant="gradientPrimary"
              className="w-fit gap-2"
              startIcon={<FontAwesomeIcon icon={faUpload} />}
              isLoading={createLoading}
              disabled={actionState.disabled}
            >
              {actionState.buttonText}
            </Button>
          </div> */
}
