import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useProductContext } from "@/views/products/product/ProductContext";
import { Upload } from "lucide-react";
import { useProductQuery } from "../hooks/useProductQuery";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { toast } from "sonner";
import { useProductCountsQuery } from "../hooks/queries/useProductCountsQuery";
import { updateProduct } from "../utils/updateProduct";

export const UpdateProductButton = () => {
  const [buttonLoading, setButtonLoading] = useState(false);
  const axiosInstance = useAxiosInstance();

  const { actionState, product, setShowNewVersionDialog } = useProductContext();
  const { counts, isLoading } = useProductCountsQuery();

  const { refetch } = useProductQuery();

  const handleUpdateClicked = async () => {
    if (isLoading) toast.error("Product counts are loading");

    if (counts?.all > 0) {
      setShowNewVersionDialog(true);
      return;
    }

    setButtonLoading(true);
    const success = await updateProduct({
      axiosInstance,
      product,
      onSuccess: async () => {
        await refetch();
      },
    });

    setButtonLoading(false);
  };

  return (
    <Button
      onClick={handleUpdateClicked}
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
