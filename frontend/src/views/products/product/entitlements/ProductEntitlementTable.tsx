import {
  formatUnixToDateTime,
  formatUnixToDateTimeString,
} from "@/utils/formatUtils/formatDateUtils";
import React, { useState } from "react";
import { useRouter } from "next/navigation";

import {
  Table,
  TableHead,
  TableHeader,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { FeatureTypeBadge } from "@/views/features/FeatureTypeBadge";
import {
  AllowanceType,
  Entitlement,
  EntitlementWithFeature,
  FeatureType,
} from "@autumn/shared";
import UpdateEntitlement from "./UpdateEntitlement";

export const ProductEntitlementTable = ({
  entitlements,
}: {
  entitlements: EntitlementWithFeature[];
}) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedEntitlement, setSelectedEntitlement] =
    useState<Entitlement | null>(null);

  const handleRowClick = (entitlement: EntitlementWithFeature) => {
    setSelectedEntitlement(entitlement);
    setOpen(true);
  };

  const getAllowanceString = (entitlement: EntitlementWithFeature) => {
    if (entitlement.feature?.type === FeatureType.Boolean) {
      return "";
    }

    if (entitlement.allowance_type != AllowanceType.Fixed) {
      return entitlement.allowance_type;
    }

    return `${entitlement.allowance} / ${entitlement.interval}`;
  };

  return (
    <>
      <UpdateEntitlement
        open={open}
        setOpen={setOpen}
        selectedEntitlement={selectedEntitlement}
        setSelectedEntitlement={setSelectedEntitlement}
      />
      <Table>
        <TableHeader className="rounded-full">
          <TableRow>
            <TableHead className="">Feature Name</TableHead>
            <TableHead>Feature ID</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Allowance</TableHead>
            <TableHead>Created At</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entitlements.map((entitlement: EntitlementWithFeature) => (
            <TableRow
              key={`${entitlement.id}-${entitlement.feature?.id}`}
              className="cursor-pointer"
              onClick={() => handleRowClick(entitlement)}
            >
              <TableCell className="min-w-32 font-medium">
                {entitlement.feature?.name}
              </TableCell>
              <TableCell className="min-w-32 font-mono text-t2">
                {entitlement.feature?.id}
              </TableCell>
              <TableCell className="min-w-32">
                <FeatureTypeBadge type={entitlement.feature?.type} />
              </TableCell>
              <TableCell className="min-w-48 w-full">
                {getAllowanceString(entitlement)}
              </TableCell>
              <TableCell className="min-w-48">
                {formatUnixToDateTimeString(entitlement.created_at)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
};
