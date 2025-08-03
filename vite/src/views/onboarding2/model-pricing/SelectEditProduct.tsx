import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useModelPricingContext } from "./ModelPricingContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDownIcon } from "lucide-react";

export const SelectEditProduct = () => {
  const { data, product, setProduct } = useModelPricingContext();

  if (data.products.length > 3) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="w-fit text-t3">
            <p className="text-t3">{product?.name || "None"}</p>
            <ChevronDownIcon size={14} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-[600px]">
          {data.products.map((p: any) => {
            if (!p.name) {
              return null;
            }
            return (
              <DropdownMenuItem key={p.id} onClick={() => setProduct(p)}>
                {p.name}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const tabTriggerClass =
    "data-[state=active]:bg-stone-200 data-[state=active]:text-t2 data-[state=active]:font-medium";

  return (
    <Tabs className="" value={product.id}>
      <TabsList className="gap-1 mr-1">
        {data.products.map((p: any) => {
          if (!p.name) {
            return null;
          }
          return (
            <TabsTrigger
              key={p.id}
              value={p.id}
              className={tabTriggerClass}
              onClick={() => setProduct(p)}
            >
              {p.name}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
};
