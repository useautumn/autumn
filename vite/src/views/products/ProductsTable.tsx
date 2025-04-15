import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { Product } from "@autumn/shared";
import { useNavigate } from "react-router";
import { ProductRowToolbar } from "./ProductRowToolbar";
import { navigateTo } from "@/utils/genUtils";
import { useProductsContext } from "./ProductsContext";
import { Badge } from "@/components/ui/badge";
import { AdminHover } from "@/components/general/AdminHover";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import { Item, Row } from "@/components/general/TableGrid";

export const ProductsTable = ({ products }: { products: Product[] }) => {
  const { env, onboarding } = useProductsContext();
  const navigate = useNavigate();
  const { allCounts } = useProductsContext();

  return (
    <>
      {products && products.length > 0 ? (
        <Row type="header" className="grid-cols-18 -mb-1">
          <Item className="col-span-3">Name</Item>
          <Item className="col-span-3">Product ID</Item>
          <Item className="col-span-3">Active</Item>
          <Item className="col-span-3">Type</Item>
          <Item className="col-span-3">{!onboarding ? "Group" : ""}</Item>
          <Item className="col-span-2">{!onboarding ? "Created At" : ""}</Item>
          <Item className="col-span-1"></Item>
        </Row>
      ) : (
        <div className="flex justify-start items-center h-10 px-10 text-t3">
          Products define the features your customers can access and how much
          they cost. Create your first product to get started ☝️.
        </div>
      )}

      {products &&
        products.map((product) => (
          <Row
            key={product.id}
            className="grid-cols-18 gap-2 items-center px-10 w-full text-sm h-8 cursor-pointer hover:bg-primary/5 text-t2 whitespace-nowrap"
            onClick={() => navigateTo(`/products/${product.id}`, navigate, env)}
          >
            <Item className="col-span-3">
              <AdminHover
                texts={[
                  { key: "Internal ID", value: product.internal_id },
                  { key: "Version", value: product.version.toString() },
                ]}
              >
                <span className="truncate">{product.name}</span>
              </AdminHover>
            </Item>
            <Item className="col-span-3 font-mono ">
              <span className="truncate">{product.id}</span>
            </Item>
            <Item className="col-span-3">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <p className="font-mono rounded-full text-t3 px-2 font-mono py-0">
                      {(allCounts && allCounts[product.id]?.active) || 0}
                    </p>
                  </TooltipTrigger>
                  <TooltipContent
                    side="bottom"
                    align="start"
                    className="bg-white/50 backdrop-blur-sm shadow-sm border-1 px-2 pr-6 py-2 text-t3"
                  >
                    {allCounts &&
                      allCounts[product.id] &&
                      Object.keys(allCounts[product.id]).map((key) => {
                        if (key === "active" || key == "custom" || key == "all")
                          return null;
                        return (
                          <div key={key}>
                            {keyToTitle(key)}: {allCounts[product.id][key]}
                          </div>
                        );
                      })}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Item>
            <Item className="col-span-3">
              {product.is_default ? (
                <Badge variant="outline">Default</Badge>
              ) : product.is_add_on ? (
                <Badge variant="outline">Add-On</Badge>
              ) : (
                <></>
              )}
            </Item>
            <Item className="col-span-3">{!onboarding && product.group}</Item>
            <Item className="col-span-2 lg:overflow-visible text-t3 text-xs">
              {!onboarding && (
                <>
                  {formatUnixToDateTime(product.created_at).date}
                  {/* <span className="text-t3">
                    {" "}
                    {formatUnixToDateTime(product.created_at).time}
                  </span> */}
                </>
              )}
            </Item>
            <Item className="col-span-1 items-center justify-end">
              <ProductRowToolbar product={product} />
            </Item>
          </Row>
        ))}
    </>
  );
};
