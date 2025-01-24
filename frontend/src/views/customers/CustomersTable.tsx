import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { Customer, Product } from "@autumn/shared";
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

export const CustomersTable = ({ customers }: { customers: Customer[] }) => {
  const { env } = useCustomersContext();
  const router = useRouter();

  return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="">Customer</TableHead>
            <TableHead>Customer ID</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Created At</TableHead>
            <TableHead className="w-20"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {customers.map((customer) => (
            <TableRow
              key={customer.id}
              className="cursor-pointer"
              onClick={() => navigateTo(`/customers/${customer.id}`, router, env)}
            >
              <TableCell className="min-w-32 font-medium">
                {customer.name}
              </TableCell>
              <TableCell className="min-w-32 font-mono text-t2">
                {" "}
                {customer.id}{" "}
              </TableCell>
              <TableCell className="min-w-32 text-t2 w-full">
                {" "}
                {customer.email}{" "}
              </TableCell>
              <TableCell className="max-w-48 min-w-24">
                {formatUnixToDateTime(customer.created_at).date}
                <span className="text-t3">
                  {" "}
                  {formatUnixToDateTime(customer.created_at).time}{" "}
                </span>
              </TableCell>
              <TableCell className="w-20 ">
                {/* <ProductRowToolbar product={product} /> */}
              </TableCell>
            </TableRow>
          ))}
      </TableBody>
    </Table>
  );
};
