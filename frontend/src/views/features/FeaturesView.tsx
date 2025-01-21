"use client";

import React, { useState } from "react";
import { FeaturesContext } from "./FeaturesContext";
import { useAxiosSWR } from "@/services/useAxiosSwr";
import { Feature, FeatureType } from "@autumn/shared";
import { CreateFeature } from "./CreateFeature";
import { AppEnv } from "@autumn/shared";
import LoadingScreen from "../general/LoadingScreen";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  formatUnixToDateTime,
  formatUnixToDateTimeString,
} from "@/utils/formatUtils/formatDateUtils";
import { FeatureRowToolbar } from "./FeatureRowToolbar";
import { FeatureTypeBadge } from "./FeatureTypeBadge";
import UpdateFeature from "./UpdateFeature";
import { CustomToaster } from "@/components/general/CustomToaster";

function FeaturesView({ env }: { env: AppEnv }) {
  const [open, setOpen] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<any>(null);

  const { data, isLoading, error, mutate } = useAxiosSWR({
    url: `/features`,
    env: env,
    withAuth: true,
  });

  if (isLoading) {
    return <LoadingScreen />;
  }

  const handleRowClick = (id: string) => {
    const feature = data?.features.find(
      (feature: Feature) => feature.id === id
    );
    setSelectedFeature(feature);
    setOpen(true);
  };

  const features = data?.features.filter(
    (feature: Feature) => feature.type !== "credit_system"
  );

  const getMeteredEventNames = (feature: Feature) => {
    if (feature.type !== FeatureType.Metered) return "";

    if (!feature.config.filters || feature.config.filters.length === 0)
      return "";

    return feature.config.filters[0].value.join(", ");
  };

  return (
    <FeaturesContext.Provider
      value={{
        features: features,
        dbConns: data?.dbConns,
        env,
        mutate,
      }}
    >
      <CustomToaster />
      <div>
        <h1 className="text-t1 text-xl font-medium">Features</h1>
        <p className="text-sm text-t2">
          Define the metered and boolean features your users are entitled to
        </p>
      </div>

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
            <TableHead>Event Names</TableHead>
            <TableHead className="w-sm">Created At</TableHead>
            <TableHead className="w-20"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {features.map((feature: Feature) => (
            <TableRow
              key={feature.internal_id}
              className="cursor-pointer"
              onClick={() => handleRowClick(feature.id)}
            >
              <TableCell className="min-w-32 font-medium">
                {feature.name}
              </TableCell>
              <TableCell className="min-w-32 font-mono text-t2">
                {feature.id}
              </TableCell>
              <TableCell className="min-w-32">
                <FeatureTypeBadge type={feature.type} />
              </TableCell>
              <TableCell className="w-full">
                {getMeteredEventNames(feature)}
              </TableCell>

              <TableCell className="min-w-48">
                {formatUnixToDateTimeString(feature.created_at)}
              </TableCell>
              <TableCell className="w-20">
                <FeatureRowToolbar feature={feature} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <CreateFeature />
    </FeaturesContext.Provider>
  );
}

export default FeaturesView;
