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

const CustomerWithProductsSchema = CustomerSchema.extend({
  products: z.array(CusProductSchema.extend({ product: ProductSchema })),
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
    // const cusProducts = cus.products;
    // console.log("cusProducts", cusProducts);
    if (customer.products.length === 0) {
      return <></>;
    }

    const getProductBadge = (cusProduct: FullCusProduct) => {
      const name = cusProduct.product.name;
      const status = cusProduct.status;

      if (status === CusProductStatus.Expired) {
        return null;
      } else if (status === CusProductStatus.PastDue) {
        return <Badge variant="red">{name} (Past Due)</Badge>;
      } else {
        if (cusProduct.canceled_at) {
          return <Badge variant="yellow">{name} (Canceled)</Badge>;
        } else if (
          cusProduct.trial_ends_at &&
          !unixHasPassed(cusProduct.trial_ends_at)
        ) {
          return <Badge variant="green">{name} (Trial)</Badge>;
        } else {
          return <Badge variant="green">{name}</Badge>;
        }
      }
    };

    return (
      <>
        {customer.products.map((cusProduct: any) => (
          <React.Fragment key={cusProduct.id}>
            {getProductBadge(cusProduct)}
          </React.Fragment>
        ))}
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
        {customers.map((customer) => (
          <TableRow
            key={customer.id}
            className="cursor-pointer"
            onClick={() => navigateTo(`/customers/${customer.id}`, router, env)}
          >
            <TableCell>
              {customer.name}
            </TableCell>
            <TableCell className="font-mono">
              {customer.id}{" "}
            </TableCell>
            <TableCell>
              {customer.email}{" "}
            </TableCell>
            <TableCell>
              {getCusProductsInfo(customer)}
            </TableCell>
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
