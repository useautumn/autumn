import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useProductContext } from "@/views/products/product/ProductContext";
import { Upload } from "lucide-react";

export const UpdateProductButton = () => {
  const [open, setOpen] = useState(false);
  // const [loading, setLoading] = useState(false);

  const { handleCreateProduct, actionState, buttonLoading, setButtonLoading } =
    useProductContext();

  return (
    <Button
      onClick={async () => {
        setButtonLoading(true);
        await handleCreateProduct(false);
        setButtonLoading(false);
      }}
      variant="gradientPrimary"
      className="w-full gap-2"
      isLoading={buttonLoading}
      disabled={actionState.disabled}
      startIcon={<Upload size={12} />}
    >
      {actionState.buttonText}
    </Button>
  );
};
