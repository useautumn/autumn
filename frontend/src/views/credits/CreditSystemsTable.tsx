import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { Feature, FeatureType, Product } from "@autumn/shared";
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
import { CreditSystemRowToolbar } from "./CreditSystemRowToolbar";
import { useCreditsContext } from "./CreditsContext";
import UpdateCreditSystem from "./UpdateCreditSystem";

export const CreditSystemsTable = () => {
  const { features } = useCreditsContext();
  const [selectedCreditSystem, setSelectedCreditSystem] =
    useState<Feature | null>(null);
  const [open, setOpen] = useState(false);

  const handleRowClick = (id: string) => {
    const creditSystem = features.find(
      (creditSystem: Feature) => creditSystem.id === id
    );

    if (!creditSystem) return;

    setSelectedCreditSystem(creditSystem);
    setOpen(true);
  };

  const creditSystems = features.filter(
    (feature: Feature) => feature.type === FeatureType.CreditSystem
  );

  return (
    <>
      <UpdateCreditSystem
        open={open}
        setOpen={setOpen}
        selectedCreditSystem={selectedCreditSystem!}
        setSelectedCreditSystem={setSelectedCreditSystem}
      />
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
            <TableRow
              key={creditSystem.id}
              onClick={() => handleRowClick(creditSystem.id)}
            >
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
    </>
  );
};
