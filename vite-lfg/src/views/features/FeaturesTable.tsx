import {
  formatUnixToDateTime,
  formatUnixToDateTimeString,
} from "@/utils/formatUtils/formatDateUtils";
import { Feature, FeatureType, Product } from "@autumn/shared";
import React, { useState } from "react";
import { useRouter } from "next/navigation";

import { FeatureRowToolbar } from "./FeatureRowToolbar";
import {
  Table,
  TableHead,
  TableHeader,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { navigateTo } from "@/utils/genUtils";
import { useFeaturesContext } from "./FeaturesContext";
import { Badge } from "@/components/ui/badge";
import UpdateFeature from "./UpdateFeature";
import { FeatureTypeBadge } from "./FeatureTypeBadge";

export const FeaturesTable = () => {
  const { env, features, onboarding } = useFeaturesContext();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<any>(null);

  const getMeteredEventNames = (feature: Feature) => {
    if (feature.type !== FeatureType.Metered) return "";

    if (!feature.config.filters || feature.config.filters.length === 0)
      return "";

    return feature.config.filters[0].value.join(", ");
  };

  const handleRowClick = (id: string) => {
    const feature = features.find((feature: Feature) => feature.id === id);
    setSelectedFeature(feature);
    setOpen(true);
  };

  return (
    <>
      <UpdateFeature
        open={open}
        setOpen={setOpen}
        selectedFeature={selectedFeature}
        setSelectedFeature={setSelectedFeature}
      />
      <Table>
        <TableHeader className="rounded-full">
          <TableRow className="border-none">
            <TableHead className="">Name</TableHead>
            <TableHead>ID</TableHead>
            <TableHead>Type</TableHead>
            {!onboarding && <TableHead>Event Names</TableHead>}
            {!onboarding && (
              <TableHead className="min-w-0 w-28">Created At</TableHead>
            )}
            <TableHead className="min-w-0 w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {features &&
            features.map((feature: Feature) => (
              <TableRow
                key={feature.internal_id}
                className="cursor-pointer"
                onClick={() => handleRowClick(feature.id)}
              >
                <TableCell>{feature.name}</TableCell>
                <TableCell className="font-mono">{feature.id}</TableCell>
                <TableCell>
                  <FeatureTypeBadge type={feature.type} />
                </TableCell>
                {!onboarding && (
                  <TableCell>{getMeteredEventNames(feature)}</TableCell>
                )}
                {!onboarding && (
                  <TableCell className="min-w-20 w-24">
                    <span>{formatUnixToDateTime(feature.created_at).date}</span>{" "}
                    <span className="text-t3">
                      {formatUnixToDateTime(feature.created_at).time}
                    </span>
                  </TableCell>
                )}
                <TableCell className="min-w-4 w-6">
                  <FeatureRowToolbar feature={feature} />
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </>
  );
};
