import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUpload } from "@fortawesome/pro-duotone-svg-icons";
import { useState } from "react";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export const AddProductButton = ({
  handleCreateProduct,
  actionState,
}: {
  handleCreateProduct: () => Promise<void>;
  actionState: any;
}) => {
  const [createLoading, setCreateLoading] = useState(false);

  const handleClick = async () => {
    setCreateLoading(true);
    await handleCreateProduct();
    setCreateLoading(false);
  };

  return (
    <TooltipProvider>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <div>
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
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">{actionState.tooltipText}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
