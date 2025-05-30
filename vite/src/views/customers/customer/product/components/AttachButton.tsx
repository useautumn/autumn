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

export const AttachButton = () => {
  const { attachState, buttonDisabled } = useProductContext();
  const { buttonText } = attachState;
  // const [checkoutLoading, setCheckoutLoading] = useState(false);
  // const [invoiceLoading, setInvoiceLoading] = useState(false);
  // const [open, setOpen] = useState(false);

  // const { handleCreateProduct, actionState, setUseInvoice } =
  //   useProductContext();

  // const handleClick = async (e: any, isInvoice: boolean) => {
  //   e.preventDefault();
  //   e.stopPropagation();

  //   if (isInvoice) {
  //     setInvoiceLoading(true);
  //   } else {
  //     setCheckoutLoading(true);
  //   }
  //   if (setUseInvoice) {
  //     setUseInvoice(isInvoice);
  //   }

  //   await handleCreateProduct(isInvoice);

  //   if (isInvoice) {
  //     setInvoiceLoading(false);
  //   } else {
  //     setCheckoutLoading(false);
  //   }
  //   setOpen(false);
  // };

  // const [loading, setLoading] = useState(false);

  return (
    <Button
      onClick={() => {}}
      variant="gradientPrimary"
      className="w-full gap-2"
      startIcon={<Upload size={12} />}
      disabled={buttonDisabled}
    >
      {buttonText}
    </Button>
  );
};

// const getProductActionState = () => {
//   if (oneTimePurchase) {
//     return {
//       buttonText: "Purchase Product",
//       tooltipText: "Purchase this product for the customer",
//       disabled: false,
//     };
//   }

//   if (product.is_add_on) {
//     return {
//       buttonText: "Enable Product",
//       tooltipText: `Enable product ${product.name} for ${customer.name}`,
//       disabled: false,
//     };
//   }
//   // Case 1: Product is active, no changes, and is not an add-on
//   if (product.isActive && !hasOptionsChanges && !hasChanges) {
//     return {
//       buttonText: "Update Product",
//       tooltipText: "No changes have been made to update",
//       disabled: true,
//     };
//   }

//   if (product.isActive && hasOptionsChanges && !hasChanges) {
//     return {
//       buttonText: "Update Options",
//       tooltipText: "You're editing the quantity of a live product",
//       disabled: false,
//       state: "update_options_only",
//       successMessage: "Product updated successfully",
//     };
//   }

//   if (product.isActive && !product.is_add_on) {
//     return {
//       buttonText: "Update Product",
//       tooltipText: `You're editing the live product ${product.name} and updating it to a custom version for ${customer.name}`,

//       disabled: false, //TODO: remove this
//     };
//   }
//   if (hasChanges) {
//     return {
//       buttonText: "Create Custom Version",
//       tooltipText: `You have edited product ${product.name} and are creating a custom version for ${customer.name}`,
//       disabled: false,
//     };
//   }
//   return {
//     buttonText: "Enable Product",
//     tooltipText: `Enable product ${product.name} for ${customer.name}`,
//     disabled: false,
//   };
// };

// const actionState = getProductActionState();
