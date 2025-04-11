import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  AllowanceType,
  FeatureType,
  FullCustomerEntitlement,
} from "@autumn/shared";

import { useCustomerContext } from "../CustomerContext";
import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { compareStatus } from "@/utils/genUtils";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import UpdateCusEntitlement from "./UpdateCusEntitlement";
import { AdminHover } from "@/components/general/AdminHover";
import React from "react";

export const CustomerEntitlementsList = ({
  featureType,
  showExpired,
}: {
  featureType: FeatureType;
  showExpired: boolean;
}) => {
  const { products, customer, entities } = useCustomerContext();
  const [selectedCusEntitlement, setSelectedCusEntitlement] =
    useState<FullCustomerEntitlement | null>(null);

  const filteredEntitlements = customer.entitlements.filter(
    (cusEnt: FullCustomerEntitlement) => {
      const entFeatureType = cusEnt.entitlement.feature.type;
      const cusProduct = customer.products.find(
        (p: any) => p.id === cusEnt.customer_product_id
      );
      const isExpired = cusProduct?.status === "expired";
      const isScheduled = cusProduct?.status === "scheduled";
      // Filter by feature type
      const featureTypeMatches =
        featureType === FeatureType.Boolean
          ? entFeatureType === FeatureType.Boolean
          : entFeatureType === FeatureType.Metered ||
            entFeatureType === FeatureType.CreditSystem;

      // Filter by expired status
      const expiredStatusMatches = showExpired ? true : !isExpired;

      return featureTypeMatches && expiredStatusMatches && !isScheduled;
    }
  );

  const getProductName = (cusEnt: FullCustomerEntitlement) => {
    const cusProduct = customer.products.find(
      (p: any) => p.id === cusEnt.customer_product_id
    );

    const product = products.find((p: any) => p.id === cusProduct?.product_id);

    return product?.name;
  };

  // const sortedEntitlements = filteredEntitlements.sort((a: any, b: any) => {
  //   const statusA = customer.products.find(
  //     (cp: any) => cp.id === a.customer_product_id
  //   )?.status;

  //   const statusB = customer.products.find(
  //     (cp: any) => cp.id === b.customer_product_id
  //   )?.status;

  //   if (statusA !== statusB) {
  //     return compareStatus(statusA, statusB);
  //   }

  //   const productA = customer.products.find(
  //     (cp: any) => cp.id === a.customer_product_id
  //   );

  //   const productB = customer.products.find(
  //     (cp: any) => cp.id === b.customer_product_id
  //   );

  //   return productA.product.name.localeCompare(productB.product.name);
  // });

  const sortedEntitlements = filteredEntitlements;

  const handleSelectCusEntitlement = (cusEnt: FullCustomerEntitlement) => {
    setSelectedCusEntitlement(cusEnt);
  };

  const getAdminHoverTexts = (cusEnt: FullCustomerEntitlement) => {
    let entitlement = cusEnt.entitlement;
    let featureEntities = entities.filter(
      (e: any) => e.feature_id === entitlement.feature.id
    );

    let hoverTexts = [
      {
        key: "Cus Ent ID",
        value: cusEnt.id,
      },
    ];

    if (featureEntities.length > 0) {
      hoverTexts.push({
        key: "Entities",
        value: featureEntities
          .map((e: any) => `${e.id} (${e.name})${e.deleted ? " Deleted" : ""}`)
          .join("\n"),
      });
    } else if (cusEnt.entities && Object.keys(cusEnt.entities).length > 0) {
      let mappedEntities = Object.keys(cusEnt.entities)
        .map((e: any) => {
          let entity = entities.find((ee: any) => ee.id === e);
          if (!entity) {
            return `${e}: Deleted`;
          }
          let balance = cusEnt.entities![e].balance;
          return `${entity.id} (${entity.name}): ${balance}`;
        })
        .join("\n");
      hoverTexts.push({
        key: "Entities",
        value: mappedEntities,
      });
    }

    return hoverTexts;
  };

  return (
    <div>
      <UpdateCusEntitlement
        selectedCusEntitlement={selectedCusEntitlement}
        setSelectedCusEntitlement={setSelectedCusEntitlement}
      />
      <Table className="p-2">
        <TableHeader className="bg-transparent">
          <TableRow className="">
            <TableHead className="">Feature</TableHead>
            <TableHead className="">
              {featureType === FeatureType.Metered && "Balance"}
            </TableHead>
            <TableHead className="">Product</TableHead>
            <TableHead className="min-w-0 w-28">
              {featureType === FeatureType.Metered && "Next Reset"}
            </TableHead>
            {/* <TableHead className="">Status</TableHead> */}
            <TableHead className="min-w-0 w-6"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedEntitlements.map(
            (cusEnt: FullCustomerEntitlement & { unused: number }) => {
              const entitlement = cusEnt.entitlement;
              const allowanceType = entitlement.allowance_type;
              return (
                <TableRow
                  key={cusEnt.id}
                  onClick={() => handleSelectCusEntitlement(cusEnt)}
                  className="cursor-pointer"
                >
                  <TableCell>
                    <AdminHover texts={getAdminHoverTexts(cusEnt)}>
                      {entitlement.feature.name}
                    </AdminHover>
                  </TableCell>
                  <TableCell>
                    {allowanceType == AllowanceType.Unlimited ? (
                      "Unlimited"
                    ) : allowanceType == AllowanceType.None ? (
                      "None"
                    ) : (
                      <React.Fragment>
                        {cusEnt.balance}
                        <span className="text-t3">
                          {cusEnt.unused ? ` (${cusEnt.unused} free)` : ""}
                        </span>
                      </React.Fragment>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[150px] truncate">
                    {getProductName(cusEnt)} &nbsp;
                    {customer.products.find(
                      (p: any) => p.id === cusEnt.customer_product_id
                    )?.status === "expired" && (
                      <Badge variant="status" className="bg-red-500">
                        expired
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <span>
                      {formatUnixToDateTime(cusEnt.next_reset_at).date}
                    </span>{" "}
                    <span className="text-t3">
                      {formatUnixToDateTime(cusEnt.next_reset_at).time}
                    </span>
                  </TableCell>
                  <TableCell></TableCell>
                </TableRow>
              );
            }
          )}
        </TableBody>
      </Table>
    </div>
  );
};
