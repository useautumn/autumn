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

export const ProductsTable = ({ products }: { products: Product[] }) => {
  const { env, onboarding } = useProductsContext();
  const navigate = useNavigate();
  return (
    <Table>
      <TableHeader className="rounded-full">
        <TableRow>
          <TableHead className="w-full">
            <div className="flex grid grid-cols-10">
              <div className="col-span-2">Name</div>
              <div className="col-span-2">Product ID</div>
              <div className="col-span-2">Type</div>
              <div className="col-span-2">{!onboarding ? "Group" : ""}</div>
              <div className="col-span-2">
                {!onboarding ? "Created At" : ""}
              </div>
            </div>
          </TableHead>
          {/* <TableHead>Product ID</TableHead>
          <TableHead>Type</TableHead>
          {!onboarding && <TableHead>Group</TableHead>}
          {!onboarding && (
            <TableHead className="min-w-0 w-28">Created At</TableHead>
          )}
          <TableHead className="min-w-0 w-10"></TableHead> */}
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
                <div className="grid grid-cols-10">
                  <CustomTableCell colSpan={2}>{product.name}</CustomTableCell>
                  <CustomTableCell colSpan={2}>{product.id}</CustomTableCell>
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
