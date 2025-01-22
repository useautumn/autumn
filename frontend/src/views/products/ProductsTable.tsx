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
          <TableHead>Created At</TableHead>
          <TableHead className="w-20"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((product) => (
          <TableRow
            key={product.id}
            className="cursor-pointer"
            onClick={() => navigateTo(`/products/${product.id}`, router, env)}
          >
            <TableCell className="min-w-32 font-medium">
              {product.name}
            </TableCell>
            <TableCell className="min-w-72 font-mono text-t2">
              {product.id}
            </TableCell>
            <TableCell className="min-w-32 text-t2 w-full">
              {product.is_default ? (
                <Badge variant="outline">Default</Badge>
              ) : product.is_add_on ? (
                <Badge variant="outline">Add-On</Badge>
              ) : (
                <></>
              )}
            </TableCell>
            <TableCell className="min-w-48">
              {formatUnixToDateTimeString(product.created_at)}
            </TableCell>
            <TableCell className="w-20 ">
              <ProductRowToolbar product={product} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
