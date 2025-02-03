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
  const { env } = useProductsContext();
  const router = useRouter();
  return (
    <Table>
      <TableHeader className="rounded-full">
        <TableRow>
          <TableHead className="">Name</TableHead>
          <TableHead>Product ID</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Group</TableHead>
          <TableHead>Created At</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((product) => (
          <TableRow
            key={product.id}
            className="cursor-pointer"
            onClick={() => navigateTo(`/products/${product.id}`, router, env)}
          >
            <TableCell className="font-medium">
              {product.name}
            </TableCell>
            <TableCell className="font-mono">
              {product.id}
            </TableCell>
            <TableCell className="min-w-32">
              {product.is_default ? (
                <Badge variant="outline">Default</Badge>
              ) : product.is_add_on ? (
                <Badge variant="outline">Add-On</Badge>
              ) : (
                <></>
              )}
            </TableCell>
            <TableCell>{product.group}</TableCell>
            <TableCell className="min-w-20 w-24">
              <span>
                {formatUnixToDateTime(product.created_at).date}
              </span>
              {" "}
              <span className="text-t3">
                {formatUnixToDateTime(product.created_at).time}
              </span>
            </TableCell>
            <TableCell className="min-w-4 w-6">
              <ProductRowToolbar product={product} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
