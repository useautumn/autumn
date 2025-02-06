import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import {
  CusProductSchema,
  CusProductStatus,
  CustomerSchema,
  FullCusProduct,
  ProductSchema,
} from "@autumn/shared";
import React from "react";
import { useRouter } from "next/navigation";

import {
  Table,
  TableHead,
  TableHeader,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { navigateTo } from "@/utils/genUtils";
import { useCustomersContext } from "./CustomersContext";
import { Badge } from "@/components/ui/badge";
import { unixHasPassed } from "@/utils/dateUtils";
import { z } from "zod";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const CustomerWithProductsSchema = CustomerSchema.extend({
  customer_products: z.array(
    CusProductSchema.extend({ product: ProductSchema })
  ),
});
type CustomerWithProducts = z.infer<typeof CustomerWithProductsSchema>;

export const CustomersTable = ({
  customers,
}: {
  customers: CustomerWithProducts[];
}) => {
  const { env } = useCustomersContext();
  const router = useRouter();

  // console.log("customers", customers);
  const getCusProductsInfo = (customer: CustomerWithProducts) => {
    if (
      !customer.customer_products ||
      customer.customer_products.length === 0
    ) {
      return <></>;
    }

    // Filter out expired products first
    const activeProducts = customer.customer_products.filter(
      (cusProduct) => cusProduct.status !== CusProductStatus.Expired
    );

    if (activeProducts.length === 0) {
      return <></>;
    }

    const getProductBadge = (cusProduct: FullCusProduct) => {
      const name = cusProduct.product.name;
      const status = cusProduct.status;

      if (status === CusProductStatus.PastDue) {
        return (
          <>
            <span>{name}</span>{" "}
            <Badge variant="status" className="bg-red-500">
              Past Due
            </Badge>
          </>
        );
      } else {
        if (cusProduct.canceled_at) {
          return (
            <>
              <span>{name}</span>{" "}
              <Badge variant="status" className="bg-yellow-500">
                Canceled
              </Badge>
            </>
          );
        } else if (
          cusProduct.trial_ends_at &&
          !unixHasPassed(cusProduct.trial_ends_at)
        ) {
          return (
            <>
              <span>{name}</span>{" "}
              <Badge variant="status" className="bg-lime-500">
                Trial
              </Badge>
            </>
          );
        } else {
          return (
            <>
              <span>{name}</span>
            </>
          );
        }
      }
    };

    return (
      <>
        <div className="flex flex-wrap gap-2">
          {activeProducts.slice(0, 1).map((cusProduct: any, index: number) => (
            <div key={index}>
              {getProductBadge(cusProduct)}
              {activeProducts.length > 1 && (
                <TooltipProvider>
                  <Tooltip delayDuration={0}>
                    <TooltipTrigger>
                      <Badge
                        variant="status"
                        className="ml-1 bg-stone-100 text-primary"
                      >
                        +{activeProducts.length - 1}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      {activeProducts
                        .slice(1)
                        .map((p: any) => p.product.name)
                        .join(", ")}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          ))}
        </div>
      </>
    );
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="">Customer</TableHead>
          <TableHead>Customer ID</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Products</TableHead>
          <TableHead>Created At</TableHead>
          {/* <TableHead className="w-20"></TableHead> */}
        </TableRow>
      </TableHeader>
      <TableBody>
        {customers.map((customer, index) => (
          <TableRow
            key={index}
            className="cursor-pointer"
            onClick={() => navigateTo(`/customers/${customer.id}`, router, env)}
          >
            <TableCell>{customer.name}</TableCell>
            <TableCell className="font-mono">{customer.id} </TableCell>
            <TableCell>{customer.email} </TableCell>
            <TableCell>{getCusProductsInfo(customer)}</TableCell>
            <TableCell className="min-w-20 w-24">
              {formatUnixToDateTime(customer.created_at).date}
              <span className="text-t3">
                {" "}
                {formatUnixToDateTime(customer.created_at).time}{" "}
              </span>
            </TableCell>
            {/* <TableCell className="w-20">
              <ProductRowToolbar product={product} />
            </TableCell> */}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
