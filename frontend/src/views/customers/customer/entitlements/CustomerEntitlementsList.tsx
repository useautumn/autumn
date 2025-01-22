import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  CusEntWithFeatureAndEntitlement,
  FullCustomerEntitlement,
} from "@autumn/shared";

import { useCustomerContext } from "../CustomerContext";

export const CustomerEntitlementsList = ({ customer }: { customer: any }) => {
  const { products } = useCustomerContext();

  const getProductName = (cusEnt: FullCustomerEntitlement) => {
    const cusProduct = customer.products.find(
      (p: any) => p.id === cusEnt.customer_product_id
    );

    const product = products.find((p: any) => p.id === cusProduct?.product_id);

    return product?.name;
  };

  return (
    <div>
      <Table className="p-2">
        <TableHeader className="bg-transparent">
          <TableRow className="">
            <TableHead className="w-[150px]">Product</TableHead>
            <TableHead className="w-[150px]">Feature</TableHead>
            <TableHead className="">Balance</TableHead>
            {/* <TableHead className="w-[100px]"></TableHead> */}
          </TableRow>
        </TableHeader>
        <TableBody>
          {customer.entitlements.map((cusEnt: FullCustomerEntitlement) => (
            <TableRow key={cusEnt.id}>
              <TableCell className="max-w-[150px] truncate">
                {getProductName(cusEnt)}
              </TableCell>
              <TableCell className="max-w-[150px] truncate">
                {cusEnt.entitlement.feature.name}
              </TableCell>
              <TableCell>{cusEnt.balance}</TableCell>
              {/* <TableCell className="flex justify-end">
                  <CustomerEntitlementToolbar
                    entitlement={cusEnt.entitlement}
                  />
                </TableCell> */}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
