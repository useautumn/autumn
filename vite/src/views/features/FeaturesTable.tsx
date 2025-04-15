import {
  formatUnixToDateTime,
  formatUnixToDateTimeString,
} from "@/utils/formatUtils/formatDateUtils";
import { Feature, FeatureType, Product } from "@autumn/shared";
import React, { useState } from "react";
import { useNavigate } from "react-router";

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
import { Item, Row } from "@/components/general/TableGrid";

export const FeaturesTable = () => {
  const { env, features, onboarding } = useFeaturesContext();
  const navigate = useNavigate();

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
    <div>
      <UpdateFeature
        open={open}
        setOpen={setOpen}
        selectedFeature={selectedFeature}
        setSelectedFeature={setSelectedFeature}
      />
      {features && features.length > 0 ? (
        <Row type="header" className="grid-cols-18 -mb-1">
          <Item className="col-span-4">Name</Item>
          <Item className="col-span-4">ID</Item>
          <Item className="col-span-3">Type</Item>
          {!onboarding && <Item className="col-span-4">Event Names</Item>}
          {!onboarding && <Item className="col-span-2">Created At</Item>}
          <Item className="col-span-1"></Item>
        </Row>
      ) : (
        <div className="flex justify-start items-center px-10 h-10 text-t3">
          Define the features of your application you want to charge for.
        </div>
      )}

      {features.map((feature: Feature) => (
        <Row
          key={feature.internal_id}
          className="grid-cols-18 gap-2 items-center px-10 w-full text-sm h-8 cursor-pointer hover:bg-primary/5 text-t2 whitespace-nowrap"
          onClick={() => handleRowClick(feature.id)}
        >
          <Item className="col-span-4">
            <span className="truncate">{feature.name}</span>
          </Item>
          <Item className="col-span-4 font-mono">
            <span className="truncate">{feature.id}</span>
          </Item>
          <Item className="col-span-3">
            <FeatureTypeBadge type={feature.type} />
          </Item>
          {!onboarding && (
            <Item className="col-span-4">
              <span className="truncate">{getMeteredEventNames(feature)}</span>
            </Item>
          )}
          {!onboarding && (
            <Item className="col-span-2 text-t3 text-xs">
              {formatUnixToDateTime(feature.created_at).date}
              {/* <span className="text-t3">
                {" "}
                {formatUnixToDateTime(feature.created_at).time}
              </span> */}
            </Item>
          )}
          <Item className="col-span-1 items-center justify-end">
            <FeatureRowToolbar feature={feature} />
          </Item>
        </Row>
      ))}
    </div>
  );
};
