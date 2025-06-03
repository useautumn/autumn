import { formatUnixToDate } from "@/utils/formatUtils/formatDateUtils";
import { useProductContext } from "@/views/products/product/ProductContext";
import { AttachBranch } from "@autumn/shared";
import { InfoIcon } from "lucide-react";

export const AttachInfo = () => {
  const { attachState, product } = useProductContext();
  const { preview, flags } = attachState;

  const currentProduct = preview?.current_product;

  const getAttachDescription = () => {
    switch (preview?.branch) {
      case AttachBranch.SameCustomEnts:
        return "No changes to prices or subscriptions will be made";
      case AttachBranch.Downgrade:
        if (flags.isFree) {
          return `This customers' `;
        } else {
          return `The customer is currently on ${currentProduct.name} and will downgrade to ${product.name} on ${formatUnixToDate(preview.due_next_cycle.due_at)}`;
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
