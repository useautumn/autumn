import {
  formatUnixToDateTime,
  formatUnixToDateTimeString,
} from "@/utils/formatUtils/formatDateUtils";
import { Product } from "@autumn/shared";
import React from "react";
import { useRouter } from "next/navigation";

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

export const ProductsTable = ({ products }: { products: Product[] }) => {
  const { env, onboarding } = useProductsContext();
  const router = useRouter();
  return (
    <Table>
      <TableHeader className="rounded-full">
        <TableRow>
          <TableHead className="">Name</TableHead>
          <TableHead>Product ID</TableHead>
          <TableHead>Type</TableHead>
          {!onboarding && <TableHead>Group</TableHead>}
          {!onboarding && (
            <TableHead className="min-w-0 w-28">Created At</TableHead>
          )}
          <TableHead className="min-w-0 w-10"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((product) => (
          <TableRow
            key={product.id}
            className="cursor-pointer"
            onClick={() => navigateTo(`/products/${product.id}`, router, env)}
          >
            <TableCell className="font-medium">{product.name}</TableCell>
            <TableCell className="font-mono">{product.id}</TableCell>
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
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
