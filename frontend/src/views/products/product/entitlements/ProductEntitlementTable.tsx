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
import { useProductContext } from "../ProductContext";
import { getFeature } from "@/utils/product/entitlementUtils";
export const ProductEntitlementTable = ({
  entitlements,
}: {
  entitlements: EntitlementWithFeature[];
}) => {
  const { features } = useProductContext();

  const [open, setOpen] = useState(false);
  const [selectedEntitlement, setSelectedEntitlement] =
    useState<Entitlement | null>(null);

  const handleRowClick = (entitlement: EntitlementWithFeature) => {
    setSelectedEntitlement(entitlement);
    setOpen(true);
  };

  const getAllowanceString = (entitlement: EntitlementWithFeature) => {
    const feature = getFeature(entitlement.internal_feature_id, features);

    if (feature?.type === FeatureType.Boolean) {
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
          {entitlements.map((entitlement: EntitlementWithFeature) => {
            const feature = getFeature(
              entitlement.internal_feature_id,
              features
            );

            return (
              <TableRow
                key={`${entitlement.id}-${feature?.id}`}
                className="cursor-pointer"
                onClick={() => handleRowClick(entitlement)}
              >
                <TableCell className="min-w-40 font-medium">
                  {feature?.name}
                </TableCell>
                <TableCell className="min-w-40 font-mono text-t2">
                  {feature?.id}
                </TableCell>
                <TableCell className="min-w-32">
                  <FeatureTypeBadge type={feature?.type} />
                </TableCell>
                <TableCell className="min-w-48 w-full">
                  {getAllowanceString(entitlement)}
                </TableCell>
                <TableCell className="min-w-48">
                  {formatUnixToDateTimeString(entitlement.created_at)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </>
  );
};
