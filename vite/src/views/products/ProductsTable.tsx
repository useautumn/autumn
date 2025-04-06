import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { Product } from "@autumn/shared";

import { Link, useNavigate } from "react-router";

import { ProductRowToolbar } from "./ProductRowToolbar";
import {
  Table,
  TableHead,
  TableHeader,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { navigateTo } from "@/utils/genUtils";
import { useProductsContext } from "./ProductsContext";
import { Badge } from "@/components/ui/badge";
import { CustomTableCell } from "../customers/CustomersTable";
import { AdminHover } from "@/components/general/AdminHover";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";

export const ProductsTable = ({ products }: { products: Product[] }) => {
  const { env, onboarding } = useProductsContext();
  const navigate = useNavigate();
  const { allCounts, mutateCounts } = useProductsContext();

  return (
    <Table className="!max-h-[450px] overflow-y-auto">
      <TableHeader className="rounded-full">
        <TableRow>
          <TableHead className="w-full">
            <div className="flex grid grid-cols-12">
              <div className="col-span-2">Name</div>
              <div className="col-span-2">Product ID</div>
              <div className="col-span-2">Active</div>
              <div className="col-span-2">Type</div>
              <div className="col-span-2">{!onboarding ? "Group" : ""}</div>
              <div className="col-span-2">
                {!onboarding ? "Created At" : ""}
              </div>
            </div>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products &&
          products.map((product) => (
            <TableRow
              key={product.id}
              className="cursor-pointer"
              onClick={() =>
                navigateTo(`/products/${product.id}`, navigate, env)
              }
            >
              <TableCell className="font-medium">
                <div className="grid grid-cols-12">
                  <CustomTableCell colSpan={2}>
                    <AdminHover
                      texts={[
                        { key: "Internal ID", value: product.internal_id },
                        { key: "Version", value: product.version.toString() },
                      ]}
                    >
                      {product.name}
                    </AdminHover>
                  </CustomTableCell>
                  <CustomTableCell className="font-mono" colSpan={2}>
                    {product.id}
                  </CustomTableCell>
                  <CustomTableCell colSpan={2}>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <p className="font-mono bg-stone-50 rounded-full text-t3 text-xs px-2 font-mono py-0 border-1 border-stone-200">
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
                              if (key === "active" || key == "custom")
                                return null;
                              return (
                                <div key={key}>
                                  {keyToTitle(key)}:{" "}
                                  {allCounts[product.id][key]}
                                </div>
                              );
                            })}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </CustomTableCell>
                  <CustomTableCell colSpan={2}>
                    {product.is_default ? (
                      <Badge variant="outline">Default</Badge>
                    ) : product.is_add_on ? (
                      <Badge variant="outline">Add-On</Badge>
                    ) : (
                      <></>
                    )}
                  </CustomTableCell>
                  <CustomTableCell colSpan={2}>
                    {!onboarding && product.group}
                  </CustomTableCell>

                  <CustomTableCell
                    colSpan={2}
                    className="flex justify-between w-full"
                  >
                    <div className="flex items-center gap-1">
                      {!onboarding &&
                        formatUnixToDateTime(product.created_at).date}
                      <span className="text-t3">
                        {!onboarding &&
                          formatUnixToDateTime(product.created_at).time}
                      </span>
                    </div>
                    <ProductRowToolbar product={product} />
                  </CustomTableCell>
                </div>
              </TableCell>
              {/* <TableCell className="font-mono">{product.id}</TableCell>
              <TableCell className="min-w-32">
                {product.is_default ? (
                  <Badge variant="outline">Default</Badge>
                ) : product.is_add_on ? (
                  <Badge variant="outline">Add-On</Badge>
                ) : (
                  <></>
                )}
              </TableCell>
              {!onboarding && <TableCell>{product.group}</TableCell>}
              {!onboarding && (
                <TableCell>
                  <span>{formatUnixToDateTime(product.created_at).date}</span>{" "}
                  <span className="text-t3">
                    {formatUnixToDateTime(product.created_at).time}
                  </span>
                </TableCell>
              )}
              <TableCell>
                <ProductRowToolbar product={product} />
              </TableCell> */}
            </TableRow>
          ))}
      </TableBody>
    </Table>
  );
};
