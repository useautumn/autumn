import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CustomerEntitlementToolbar } from "./CustomerEntitlementToolbar";
import { CusEntWithFeatureAndEntitlement } from "@autumn/shared";

export const CustomerEntitlementsList = ({ customer }: { customer: any }) => {
  console.log("Customer entitlements", customer.entitlements);
  return (
    <div>
      <Table className="p-2">
        <TableHeader className="bg-transparent">
          <TableRow className="">
            <TableHead className="w-[150px]">Feature</TableHead>
            <TableHead className="">Balance</TableHead>
            {/* <TableHead className="w-[100px]"></TableHead> */}
          </TableRow>
        </TableHeader>
        <TableBody>
          {customer.entitlements.map(
            (cusEnt: CusEntWithFeatureAndEntitlement) => (
              <TableRow key={cusEnt.id}>
                <TableCell className="max-w-[150px] truncate">
                  {cusEnt.feature.name}
                </TableCell>
                <TableCell>{cusEnt.balance}</TableCell>
                {/* <TableCell className="flex justify-end">
                  <CustomerEntitlementToolbar
                    entitlement={cusEnt.entitlement}
                  />
                </TableCell> */}
              </TableRow>
            )
          )}
        </TableBody>
      </Table>
    </div>
  );
};
