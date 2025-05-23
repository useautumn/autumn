import { Badge } from "@/components/ui/badge";
import { Product } from "@autumn/shared";

export const ProductTypeBadge = ({ product }: { product: Product }) => {
  return (
    <>
      {product.is_default ? (
        <Badge variant="outline">Default</Badge>
      ) : product.is_add_on ? (
        <Badge variant="outline">Add-On</Badge>
      ) : (
        <></>
      )}
    </>
  );
};
