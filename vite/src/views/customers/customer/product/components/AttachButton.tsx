import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useProductContext } from "@/views/products/product/ProductContext";

import { Upload } from "lucide-react";
import { AttachModal } from "./AttachModal";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { toast } from "sonner";
import { getAttachBody } from "./attachProductUtils";

export const AttachButton = () => {
  const axios = useAxiosInstance();
  const [open, setOpen] = useState(false);
  const [buttonLoading, setButtonLoading] = useState(false);

  const { attachState, product, entityId, customer, version } =
    useProductContext();
  const { preview, setPreview } = attachState;

  const { buttonText } = attachState;

  const handleAttachClicked = async () => {
    setButtonLoading(true);
    try {
      const res = await axios.post(
        "/v1/attach/preview",
        getAttachBody({
          customerId: customer.id || customer.internal_id,
          attachState,
          product,
          entityId,
          version: version || product.version,
        })
      );

      setPreview(res.data);
      setOpen(true);
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to attach product"));
    }
    setButtonLoading(false);
  };

  return (
    <>
      <AttachModal open={open} setOpen={setOpen} />
      <Button
        onClick={handleAttachClicked}
        variant="gradientPrimary"
        className="w-full gap-2"
        startIcon={<Upload size={12} />}
        disabled={attachState.buttonDisabled}
        isLoading={buttonLoading}
      >
        {buttonText}
      </Button>
    </>
  );
};
