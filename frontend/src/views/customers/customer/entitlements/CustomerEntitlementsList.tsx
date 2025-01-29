import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  AllowanceType,
  CusEntWithFeatureAndEntitlement,
  FullCustomerEntitlement,
} from "@autumn/shared";

import { useCustomerContext } from "../CustomerContext";
import { formatUnixToDateTimeString } from "@/utils/formatUtils/formatDateUtils";
import { compareStatus } from "@/utils/genUtils";
import { StatusBadge } from "../../StatusBadge";

export const CustomerEntitlementsList = ({ customer }: { customer: any }) => {
  const { products } = useCustomerContext();

  const getProductName = (cusEnt: FullCustomerEntitlement) => {
    const cusProduct = customer.products.find(
      (p: any) => p.id === cusEnt.customer_product_id
    );

    const product = products.find((p: any) => p.id === cusProduct?.product_id);

    return product?.name;
  };

  const sortedEntitlements = customer.entitlements.sort((a: any, b: any) => {
    const statusA = customer.products.find(
      (cp: any) => cp.id === a.customer_product_id
    )?.status;

    const statusB = customer.products.find(
      (cp: any) => cp.id === b.customer_product_id
    )?.status;

    if (statusA !== statusB) {
      return compareStatus(statusA, statusB);
    }

    const productA = customer.products.find(
      (cp: any) => cp.id === a.customer_product_id
    );

    const productB = customer.products.find(
      (cp: any) => cp.id === b.customer_product_id
    );

    return productA.product.name.localeCompare(productB.product.name);
  });

  return (
    <div>
      <Table className="p-2">
        <TableHeader className="bg-transparent">
          <TableRow className="">
            <TableHead className="w-[150px]">Product</TableHead>
            <TableHead className="w-[150px]">Feature</TableHead>
            <TableHead className="">Balance</TableHead>
            <TableHead className="">Next Reset</TableHead>
            <TableHead className="">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedEntitlements.map((cusEnt: FullCustomerEntitlement) => {
            const entitlement = cusEnt.entitlement;
            const allowanceType = entitlement.allowance_type;
            return (
              <TableRow key={cusEnt.id}>
                <TableCell className="max-w-[150px] truncate">
                  {getProductName(cusEnt)}
                </TableCell>
                <TableCell className="max-w-[150px] truncate">
                  {entitlement.feature.name}
                </TableCell>
                <TableCell>
                  {allowanceType == AllowanceType.Unlimited
                    ? "Unlimited"
                    : allowanceType == AllowanceType.None
                    ? "None"
                    : cusEnt.balance}
                </TableCell>
                <TableCell>
                  {formatUnixToDateTimeString(cusEnt.next_reset_at)}
                </TableCell>
                <TableCell>
                  <StatusBadge
                    status={
                      customer.products.find(
                        (p: any) => p.id === cusEnt.customer_product_id
                      )?.status
                    }
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};
