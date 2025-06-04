import { formatUnixToDate } from "@/utils/formatUtils/formatDateUtils";
import { useProductContext } from "@/views/products/product/ProductContext";
import { AttachBranch } from "@autumn/shared";
import { InfoIcon } from "lucide-react";

export const AttachInfo = () => {
  const { attachState, product } = useProductContext();
  const { preview, flags } = attachState;

  const currentProduct = preview?.current_product;
  const scheduledProduct = preview?.scheduled_product;

  const getAttachDescription = () => {
    if (preview?.branch == AttachBranch.Downgrade) {
      let text = `The customer is currently on ${currentProduct.name} and will downgrade to ${product.name} on ${formatUnixToDate(preview.due_next_cycle.due_at)}`;
      if (scheduledProduct) {
        text += `. The scheduled product ${scheduledProduct.product.name} will also be removed.`;
      }
      return text;
    }

    if (preview?.free_trial) {
      let text = `The free trial for ${product.name} will end on ${formatUnixToDate(preview.due_next_cycle.due_at)}`;
      if (currentProduct && currentProduct.free_trial) {
        text += ` and the customer's current trial to ${currentProduct.name} will be canceled.`;
      } else {
        text += `.`;
      }
      return text;
    }

    switch (preview?.branch) {
      case AttachBranch.SameCustomEnts:
        return "No changes to prices or subscriptions will be made";

      case AttachBranch.Renew:
        if (scheduledProduct) {
          return `${scheduledProduct.product.name} is scheduled to start on ${formatUnixToDate(scheduledProduct.starts_at)}. Renewing ${currentProduct.name} will undo this.`;
        } else {
          return null;
        }
      default:
        return null;
    }
  };
  const description = getAttachDescription();

  if (!description) {
    return null;
  }

  return (
    <div className="flex items-center p-2 bg-blue-50 border-1 border-blue-200 text-blue-400 rounded-xs">
      <div className="min-w-6 flex">
        <InfoIcon size={14} />
      </div>
      <p className="text-sm">{getAttachDescription()}</p>
    </div>
  );
};
