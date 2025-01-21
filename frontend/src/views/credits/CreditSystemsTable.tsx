import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { Feature, Product } from "@autumn/shared";
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
import { CreditSystemRowToolbar } from "./CreditSystemRowToolbar";

export const CreditSystemsTable = ({
  creditSystems,
}: {
  creditSystems: Feature[];
}) => {
  const router = useRouter();

  return (
    <Table>
      <TableHeader className="rounded-full">
        <TableRow>
          <TableHead className="">Credit System Name</TableHead>
          <TableHead>System ID</TableHead>
          <TableHead>Meters</TableHead>
          <TableHead>Created At</TableHead>
          <TableHead className="w-20"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {creditSystems.map((creditSystem) => (
          <TableRow key={creditSystem.id}>
            <TableCell className="min-w-32 font-medium">
              {creditSystem.name}
            </TableCell>
            <TableCell className="min-w-32 font-mono text-t2">
              {" "}
              {creditSystem.id}{" "}
            </TableCell>
            <TableCell className="min-w-32 font-mono text-t2 w-full">
              {creditSystem.config.schema
                .map((schema: any) => schema.metered_feature_id)
                .join(", ")}{" "}
            </TableCell>
            <TableCell className="min-w-48">
              {formatUnixToDateTime(creditSystem.created_at).date}
              <span className="text-t3">
                {" "}
                {formatUnixToDateTime(creditSystem.created_at).time}{" "}
              </span>
            </TableCell>
            <TableCell className="w-20 ">
              <CreditSystemRowToolbar creditSystem={creditSystem} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
