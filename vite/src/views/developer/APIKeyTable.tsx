import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { ApiKey } from "@autumn/shared";
import React from "react";

import { APIKeyToolbar } from "./APIKeyToolbar";
import {
  Table,
  TableHead,
  TableHeader,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Item, Row } from "@/components/general/TableGrid";

export const APIKeyTable = ({ apiKeys }: { apiKeys: ApiKey[] }) => {
  //   let { org } = useHomeContext();

  return (
    <div>
      <Row type="header" className="grid-cols-18">
        <Item className="col-span-5">Name</Item>
        <Item className="col-span-10">Preview</Item>
        <Item className="col-span-2">Created At</Item>
        <Item className="col-span-1"></Item>
      </Row>
      {apiKeys.map((key) => (
        <Row key={key.id} className="grid-cols-18">
          <Item className="col-span-5 font-normal">{key.name}</Item>
          <Item className="col-span-10 font-mono text-t2">{key.prefix}</Item>
          <Item className="col-span-2 text-t3 text-xs">
            {formatUnixToDateTime(key.created_at).date}
            {/* <span className="text-t3">
              {" "}
              {formatUnixToDateTime(key.created_at).time}{" "}
            </span> */}
          </Item>
          <Item className="col-span-1 justify-end">
            <APIKeyToolbar apiKey={key} />
          </Item>
        </Row>
      ))}
    </div>
    // <Table>
    //   <TableHeader className="rounded-full">

    //     {/* <TableRow className="">
    //       <TableHead className="">Name</TableHead>
    //       <TableHead>Preview</TableHead>
    //       <TableHead>Created At</TableHead>
    //       <TableHead className="w-20"></TableHead>
    //     </TableRow> */}
    //   </TableHeader>
    //   <TableBody>
    // {apiKeys.map((key) => (
    //   <TableRow key={key.id}>
    //     <TableCell className="min-w-32 font-medium">{key.name}</TableCell>
    //     <TableCell className="min-w-32 font-mono text-t2 w-full">
    //       {key.prefix}
    //     </TableCell>
    //     <TableCell className="min-w-48">
    //       {formatUnixToDateTime(key.created_at).date}
    //       <span className="text-t3">
    //         {" "}
    //         {formatUnixToDateTime(key.created_at).time}{" "}
    //       </span>
    //     </TableCell>
    //     <TableCell className="w-full flex justify-end">
    //       <APIKeyToolbar apiKey={key} />
    //     </TableCell>
    //   </TableRow>
    // ))}
    //   </TableBody>
    // </Table>
  );
};
