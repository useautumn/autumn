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
import { Item, Row } from "@/components/general/TableGrid";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";

export const CustomerEntitlementsList = () => {
  const [featureType, setFeatureType] = useState<FeatureType>(
    FeatureType.Metered
  );
  const [showExpired, setShowExpired] = useState(false);

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
          let balance = cusEnt.entities![e].balance;
          return `${entity?.id} (${entity?.name}): ${balance}`;
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
      <div className="flex items-center grid grid-cols-10 gap-8 justify-between border-y bg-stone-100 px-10 h-10">
        <h2 className="text-sm text-t2 font-medium col-span-2 flex whitespace-nowrap">
          Available Features
        </h2>
        <div className="flex w-full h-full items-center col-span-8 justify-end">
          <div className="flex w-fit h-full items-center">
            <div className="flex justify-between items-center gap-2 ">
              <Tabs defaultValue={featureType}>
                <TabsList className="bg-transparent h-fit">
                  <TabsTrigger
                    value="metered"
                    className="text-t2 text-xs font-normal "
                    onClick={() => setFeatureType(FeatureType.Metered)}
                  >
                    Metered
                  </TabsTrigger>
                  <TabsTrigger
                    value="boolean"
                    className="text-t2 text-xs font-normal"
                    onClick={() => setFeatureType(FeatureType.Boolean)}
                  >
                    Boolean
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="flex items-center gap-2">
                <p className="text-t3 text-xs font-normal">Show Expired</p>
                <Switch
                  checked={showExpired}
                  className="bg-primary h-3 w-6"
                  thumbClassName="size-3 data-[state=checked]:translate-x-2"
                  onCheckedChange={setShowExpired}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      <UpdateCusEntitlement
        selectedCusEntitlement={selectedCusEntitlement}
        setSelectedCusEntitlement={setSelectedCusEntitlement}
      />
      {sortedEntitlements.length === 0 ? (
        <div className="flex pl-10 items-center h-10">
          <p className="text-t3 text-xs">
            Attach a product to grant access to features
          </p>
        </div>
      ) : (
        <>
          <Row type="header" className="grid-cols-13">
            <Item className="col-span-3">Feature</Item>
            <Item className="col-span-3">
              {featureType === FeatureType.Metered && "Balance"}
            </Item>
            <Item className="col-span-3">Product</Item>
            <Item className="col-span-3">
              {featureType === FeatureType.Metered && "Next Reset"}
            </Item>
            <Item className="col-span-1" />
          </Row>
        </>
      )}

      {sortedEntitlements.map(
        (cusEnt: FullCustomerEntitlement & { unused: number }) => {
          const entitlement = cusEnt.entitlement;
          const allowanceType = entitlement.allowance_type;
          return (
            <Row
              key={cusEnt.id}
              className="grid-cols-13"
              onClick={() => handleSelectCusEntitlement(cusEnt)}
            >
              <Item className="col-span-3">
                <AdminHover texts={getAdminHoverTexts(cusEnt)}>
                  {entitlement.feature.name}
                </AdminHover>
              </Item>
              <Item className="col-span-3">
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
              </Item>
              <Item className="col-span-3">
                <div className="flex items-center gap-2 max-w-[150px] truncate">
                  {getProductName(cusEnt)}
                  {customer.products.find(
                    (p: any) => p.id === cusEnt.customer_product_id
                  )?.status === "expired" && (
                    <Badge variant="status" className="bg-red-500">
                      expired
                    </Badge>
                  )}
                </div>
              </Item>
              <Item className="col-span-3 text-xs">
                <span>{formatUnixToDateTime(cusEnt.next_reset_at).date}</span>{" "}
                <span className="text-t3">
                  {formatUnixToDateTime(cusEnt.next_reset_at).time}
                </span>
              </Item>
              <Item className="col-span-1" />
            </Row>
          );
        }
      )}
    </div>
  );
};
