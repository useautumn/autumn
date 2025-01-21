import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
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

export const ProductsTable = ({ products }: { products: Product[] }) => {
  const { env } = useProductsContext();
  const router = useRouter();
  return (
    <Table>
      <TableHeader className="rounded-full">
        <TableRow>
          <TableHead className="">Name</TableHead>
          <TableHead>Product ID</TableHead>
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
            <TableCell className="min-w-32 font-mono text-t2 w-full">
              {" "}
              {product.id}{" "}
            </TableCell>
            <TableCell className="min-w-48">
              {formatUnixToDateTime(product.created_at).date}
              <span className="text-t3">
                {" "}
                {formatUnixToDateTime(product.created_at).time}{" "}
              </span>
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
