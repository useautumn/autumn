import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { ApiKey } from "@autumn/shared";
import React from "react";

import { APIKeyToolbar } from "./APIKeyToolbar";
import { Table, TableHead, TableHeader, TableRow, TableBody, TableCell } from "@/components/ui/table";

export const APIKeyTable = ({ apiKeys }: { apiKeys: ApiKey[] }) => {
  //   let { org } = useHomeContext();

  return (
    <Table>
      <TableHeader className="rounded-full">
        <TableRow className="">
          <TableHead className="">Name</TableHead>
          <TableHead>Preview</TableHead>
          <TableHead>Created At</TableHead>
          <TableHead className="w-20"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {apiKeys.map((key) => (
          <TableRow key={key.id}>
            <TableCell className="min-w-32 font-medium">{key.name}</TableCell>
            <TableCell className="min-w-32 font-mono text-t2 w-full">{key.prefix}</TableCell>
            <TableCell className="min-w-48">
              {formatUnixToDateTime(key.created_at).date} 
              <span className="text-t3"> {formatUnixToDateTime(key.created_at).time} </span>
              </TableCell>
            <TableCell className="w-20 ">
              <APIKeyToolbar apiKey={key} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
