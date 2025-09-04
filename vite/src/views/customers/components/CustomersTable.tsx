import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import {
  CusProductSchema,
  CusProductStatus,
  CustomerSchema,
  FullCusProduct,
  ProductSchema,
} from "@autumn/shared";

import { Link, useNavigate } from "react-router";
import React from "react";
import CopyButton from "@/components/general/CopyButton";

import { getRedirectUrl } from "@/utils/genUtils";
import { Badge } from "@/components/ui/badge";
import { unixHasPassed } from "@/utils/dateUtils";
import { z } from "zod";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useEnv } from "@/utils/envUtils";
import { Item, Row } from "@/components/general/TableGrid";

import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { getVersionCounts } from "@/utils/productUtils";
import { CustomerRowToolbar } from "./CustomerRowToolbar";
import { CustomerRow } from "./customers-table/CustomerRow";

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
  return (
    <>
      <Row type="header" className="grid-cols-17 -mb-1">
        <Item className="col-span-3">Name</Item>
        <Item className="col-span-3">ID</Item>
        <Item className="col-span-3">Email</Item>
        <Item className="col-span-5">Products</Item>
        <Item className="col-span-2">Created At</Item>
      </Row>

      {customers.map((customer, index) => (
        <CustomerRow customer={customer} key={index} index={index} />
      ))}
    </>
  );
};

export const CustomTableCell = ({
  children,
  className,
  colSpan,
}: {
  children: React.ReactNode;
  className?: string;
  colSpan?: number;
}) => {
  return (
    <div
      className={cn(
        colSpan ? `col-span-${colSpan}` : "col-span-3",
        "overflow-hidden text-ellipsis pr-1",
        className
      )}
    >
      {children}
    </div>
  );
};
