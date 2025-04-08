import {
  formatUnixToDateTime,
  formatUnixToDateTimeString,
} from "@/utils/formatUtils/formatDateUtils";
import React, { useState } from "react";
import { useNavigate } from "react-router";

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
  Feature,
  FeatureType,
  PriceType,
} from "@autumn/shared";
import UpdateEntitlement from "./UpdateEntitlement";
import { useProductContext } from "../ProductContext";
import { getFeature } from "@/utils/product/entitlementUtils";
import { AdminHover } from "@/components/general/AdminHover";
import { getDefaultPriceConfig } from "@/utils/product/priceUtils";
import { Badge } from "@/components/ui/badge";
import { CircleDollarSign } from "lucide-react";
export const ProductEntitlementTable = ({
  entitlements,
}: {
  entitlements: EntitlementWithFeature[];
}) => {
  const { features, product } = useProductContext();

  const [priceConfig, setPriceConfig] = useState<any>(
    getDefaultPriceConfig(PriceType.Usage) // default price config
  );

  console.log("entitlements", entitlements);

  const [open, setOpen] = useState(false);
  const [selectedEntitlement, setSelectedEntitlement] =
    useState<Entitlement | null>(null);

  const handleRowClick = (entitlement: EntitlementWithFeature) => {
    setSelectedEntitlement(entitlement);

    const entitlementPrice = product.prices.find((price: any) => {
      return (
        price.config.internal_feature_id === entitlement?.internal_feature_id // find the price config that matches the entitlement internal feature id
      );
    });

    if (entitlementPrice) {
      console.log("entitlementPrice found", entitlementPrice);
      setPriceConfig(entitlementPrice.config);
    }

    setOpen(true);
  };

  const getAllowanceString = (
    entitlement: EntitlementWithFeature,
    feature: Feature | null
  ) => {
    if (feature?.type === FeatureType.Boolean) {
      return "";
    }

    if (entitlement.allowance_type != AllowanceType.Fixed) {
      return (
        <div className="flex items-center gap-1 whitespace-nowrap">
          <span className="">Unlimited {feature?.name}</span>
        </div>
      );
    }

    if (entitlement.entity_feature_id) {
      if (entitlement.interval === "lifetime") {
        return `${entitlement.allowance} per ${entitlement.entity_feature_id}`;
      }
      return (
        <div className="flex items-center gap-1 whitespace-nowrap">
          <span className="">
            {entitlement.allowance} {feature?.name} per{" "}
            {entitlement.entity_feature_id}
          </span>
          <span className="text-t3">per {entitlement.interval}</span>
        </div>
      );
    }

    if (entitlement.interval === "lifetime") {
      return (
        <div className="flex items-center gap-1 whitespace-nowrap">
          <span className="">
            {entitlement.allowance} {feature?.name}
          </span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1 whitespace-nowrap">
        <span className="">
          {entitlement.allowance} {feature?.name}
        </span>
        <span className="text-t3">per {entitlement.interval}</span>
      </div>
    );
  };

  return (
    <>
      <UpdateEntitlement
        open={open}
        setOpen={setOpen}
        selectedEntitlement={selectedEntitlement}
        setSelectedEntitlement={setSelectedEntitlement}
        priceConfig={priceConfig}
        setPriceConfig={setPriceConfig}
      />
      <div className="flex flex-col text-sm border bg-white rounded-sm">
        <h2 className="text-sm text-t2 font-medium bg-stone-100 px-4 py-2.5">
          Features
        </h2>
        <div className="flex flex-col">
          {entitlements.map((entitlement: EntitlementWithFeature) => {
            const feature = getFeature(
              entitlement.internal_feature_id,
              features
            );

            const price = product.prices.find((price: any) => {
              return (
                price.config.internal_feature_id ===
                  entitlement.internal_feature_id &&
                price.config.usage_tiers.some((tier: any) => tier.amount > 0)
              );
            });

            return (
              <div
                key={entitlement.id}
                className="flex grid grid-cols-10 px-4 text-t2 h-10 items-center hover:bg-zinc-50"
                onClick={() => handleRowClick(entitlement)}
              >
                <span className="font-mono text-t3 col-span-2">
                  {feature?.id}
                </span>
                <span className="col-span-5">
                  {getAllowanceString(entitlement, feature)}
                </span>
                <span className="col-span-2">
                  {price && (
                    <Badge
                      variant={"outline"}
                      className="items-center gap-1 py-1 px-2 text-t2"
                    >
                      <CircleDollarSign className="w-4 h-4 text-yellow-500" />
                    </Badge>
                  )}
                </span>
                <span className="flex text-xs text-t3 items-center col-span-1">
                  {entitlement.created_at
                    ? formatUnixToDateTime(entitlement.created_at).date
                    : formatUnixToDateTime(Math.floor(Date.now())).date}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {/* <Table>
        <TableHeader>
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
                <TableCell>
                  <AdminHover texts={[entitlement.id]}>
                    {feature?.name}
                  </AdminHover>
                </TableCell>
                <TableCell className="font-mono">{feature?.id}</TableCell>
                <TableCell>
                  <FeatureTypeBadge type={feature?.type} />
                </TableCell>
                <TableCell>{getAllowanceString(entitlement)}</TableCell>
                <TableCell className="min-w-20 w-24">
                  <span>
                    {formatUnixToDateTime(entitlement.created_at).date}
                  </span>{" "}
                  <span className="text-t3">
                    {formatUnixToDateTime(entitlement.created_at).time}
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table> */}
    </>
  );
};
