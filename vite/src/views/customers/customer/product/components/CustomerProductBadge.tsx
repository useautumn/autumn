import { Badge } from "@/components/ui/badge";
import { useProductContext } from "@/views/products/product/ProductContext";
import { useCusQuery } from "../../hooks/useCusQuery";

export const CustomerProductBadge = () => {
  const { customer } = useCusQuery();
  const { product } = useProductContext();

  if (!customer) return null;

  return (
    <Badge className="flex items-center gap-1 rounded-sm shadow-none w-full text-xs text-t2 bg-stone-100 border hover:bg-stone-100 truncate">
      <span className="">
        {product.isCustom ? (
          <>
            Custom <span className="font-bold">{product.name}</span> version for
          </>
        ) : (
          <>
            {product.isCustom ? "Custom" : "Product"}{" "}
            <span className="font-bold">{product.name}</span> for
          </>
        )}
      </span>
      <span className="truncate">
        <span className="font-bold">
          {customer.name || customer.id || customer.email}
        </span>
      </span>
    </Badge>
  );
};
