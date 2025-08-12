import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { FreeTrial, Product } from "@autumn/shared";

export const ProductTypeBadge = ({ product }: { product: any }) => {
  const badgeType = product.is_default && product.free_trial && !product.free_trial.card_required
  ? "default trial"
  : product.is_default
    ? "default"
    : product.is_add_on
      ? "add-on"
      : null;

  if (!badgeType) return null;

  return (
    // <>
    //   {product.is_default ? (
    //     <Badge variant="outline">Default</Badge>
    //   ) : product.is_add_on ? (
    //     <Badge variant="outline">Add-On</Badge>
    //   ) : (
    //     <></>
    //   )}
    // </>
    <Badge
      className={cn(
        "bg-transparent border border-t1 text-t1 rounded-md px-2 pointer-events-none",
        badgeType === "default" &&
          "bg-stone-200 text-stone-700 border-stone-700",
        badgeType === "add-on" && "bg-zinc-100 text-zinc-500 border-zinc-400",
        badgeType === "default trial" &&
          "bg-blue-100 text-blue-500 border-blue-400"
      )}
    >
      {badgeType}
    </Badge>
  );
};
