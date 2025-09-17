import {
  AllowanceType,
  FeatureType,
  FullCusEntWithFullCusProduct,
  FullCusProduct,
  FullCustomerEntitlement,
} from "@autumn/shared";

import { useCustomerContext } from "../CustomerContext";
import {
  formatUnixToDate,
  formatUnixToDateTime,
} from "@/utils/formatUtils/formatDateUtils";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import UpdateCusEntitlement from "./UpdateCusEntitlement";
import { AdminHover } from "@/components/general/AdminHover";
import { Item, Row } from "@/components/general/TableGrid";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CusProductEntityItem } from "../components/CusProductEntityItem";
import { CusEntBalance } from "./CusEntBalance";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useCusQuery } from "../hooks/useCusQuery";

export const CustomerEntitlementsList = () => {
  const [featureType, setFeatureType] = useState<FeatureType>(
    FeatureType.Metered
  );
  const [showExpired, setShowExpired] = useState(false);

  const { entityId, showEntityView } = useCustomerContext();
  const { customer, products, features, entities } = useCusQuery();

  const [selectedCusEntitlement, setSelectedCusEntitlement] =
    useState<FullCustomerEntitlement | null>(null);

  const cusEnts: FullCusEntWithFullCusProduct[] =
    customer.customer_products.flatMap((cp: any) => {
      return cp.customer_entitlements.map((e: any) => ({
        ...e,
        customer_product: cp,
      }));
    });

  const filteredEntitlements = cusEnts.filter(
    (cusEnt: FullCusEntWithFullCusProduct) => {
      const entFeatureType = cusEnt.entitlement.feature.type;
      const cusProduct = cusEnt.customer_product;

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

      // Filter by entity
      const entity = entities.find((e: any) => e.id === entityId);
      let entityMatch = true;
      if (entityId) {
        entityMatch = false;

        const cusProduct = customer.customer_products.find(
          (p: any) => p.id === cusEnt.customer_product_id
        );

        const productAttachedToEntity =
          cusProduct?.internal_entity_id === entity?.internal_id;

        const cusEntContainsEntity =
          Object.keys(cusEnt.entities || {}).includes(entity?.id) ||
          cusEnt.entitlement.entity_feature_id === entity?.feature_id;

        entityMatch = productAttachedToEntity || cusEntContainsEntity;
      }

      return (
        featureTypeMatches &&
        expiredStatusMatches &&
        !isScheduled &&
        entityMatch
      );
    }
  );

  const handleSelectCusEntitlement = (cusEnt: FullCustomerEntitlement) => {
    setSelectedCusEntitlement(cusEnt);
  };

  const getAdminHoverTexts = (cusEnt: FullCustomerEntitlement) => {
    const entitlement = cusEnt.entitlement;
    const featureEntities = entities.filter(
      (e: any) => e.feature_id === entitlement.feature.id
    );

    const hoverTexts = [
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
      const mappedEntities = Object.keys(cusEnt.entities)
        .map((e: any) => {
          const entity = entities.find((ee: any) => ee.id === e);
          const balance = cusEnt.entities![e].balance;
          return `${entity?.id} (${entity?.name}): ${balance}`;
        })
        .join("\n");
      hoverTexts.push({
        key: "Entities",
        value: mappedEntities,
      });
    }

    if (cusEnt.rollovers.length > 0) {
      hoverTexts.push({
        key: "Rollovers",
        value: cusEnt.rollovers
          .map((r: any) => {
            if (Object.values(r.entities).length > 0) {
              return (
                Object.values(r.entities)
                  .map((e: any) => `${e.balance} (${e.id})`)
                  .join(", ") +
                ` (expires: ${r.expires_at ? formatUnixToDate(r.expires_at) : "N/A"})`
              );
            } else {
              return `${r.balance} (ex: ${r.expires_at ? formatUnixToDate(r.expires_at) : "N/A"})`;
            }
          })
          .join("\n"),
      });
    }

    return hoverTexts;
  };

  return (
    <div>
      <div className="items-center grid grid-cols-10 gap-8 justify-between border-y bg-stone-100 px-10 h-10">
        <h2 className="text-sm text-t2 font-medium col-span-2 flex whitespace-nowrap">
          Available Features
        </h2>
        <div className="flex w-full h-full items-center col-span-8 justify-end">
          <div className="flex w-fit h-full items-center">
            <div className="flex justify-between items-center gap-2 ">
              <Tabs defaultValue={featureType}>
                <TabsList className="bg-transparent h-fit gap-4">
                  <Button
                    variant="ghost"
                    className={cn(
                      "text-t3 text-xs font-normal p-0",
                      showExpired && "text-t1 hover:text-t1"
                    )}
                    size="sm"
                    onClick={() => setShowExpired(!showExpired)}
                  >
                    Show Expired
                  </Button>
                  <div>
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
                  </div>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </div>
      </div>
      <UpdateCusEntitlement
        selectedCusEntitlement={selectedCusEntitlement}
        setSelectedCusEntitlement={setSelectedCusEntitlement}
      />
      {filteredEntitlements.length === 0 ? (
        <div className="flex pl-10 items-center h-10">
          <p className="text-t3">
            Attach a product to grant access to features
          </p>
        </div>
      ) : (
        <>
          <Row
            type="header"
            className={cn(
              "grid-cols-12 pr-0",
              showEntityView && "grid-cols-15"
            )}
          >
            <Item className="col-span-3">Feature</Item>
            {showEntityView && <Item className="col-span-3">Entity</Item>}
            <Item className="col-span-3">
              {featureType === FeatureType.Metered && "Balance"}
            </Item>
            <Item className="col-span-3">Product</Item>
            <Item className="col-span-2">
              {featureType === FeatureType.Metered && "Next Reset"}
            </Item>
            <Item className="col-span-1" />
          </Row>
        </>
      )}

      {filteredEntitlements.map((cusEnt: FullCusEntWithFullCusProduct) => {
        const entitlement = cusEnt.entitlement;

        return (
          <Row
            key={cusEnt.id}
            className={cn(
              "grid-cols-12 pr-0",
              showEntityView && "grid-cols-15"
            )}
            onClick={() =>
              featureType === FeatureType.Metered &&
              handleSelectCusEntitlement(cusEnt)
            }
          >
            <Item className="col-span-3">
              <AdminHover texts={getAdminHoverTexts(cusEnt)}>
                {entitlement.feature.name}
              </AdminHover>
            </Item>
            {showEntityView && (
              <Item className="col-span-3 -translate-x-1">
                <CusProductEntityItem
                  internalEntityId={cusEnt.customer_product.internal_entity_id}
                />
              </Item>
            )}
            <Item className="col-span-3">
              <CusEntBalance cusEnt={cusEnt} />
            </Item>

            <Item className="col-span-3">
              <div className="flex items-center gap-2 max-w-[150px] truncate text-t3">
                {/* {getProductName(cusEnt)} */}
                {cusEnt.customer_product.product.name}
                {customer.customer_products.find(
                  (cp: FullCusProduct) => cp.id === cusEnt.customer_product_id
                )?.status === "expired" && (
                  <Badge variant="status" className="bg-black">
                    expired
                  </Badge>
                )}
              </div>
            </Item>
            <Item className="col-span-2 text-xs text-t3">
              {formatUnixToDateTime(cusEnt.next_reset_at).date}{" "}
              {formatUnixToDateTime(cusEnt.next_reset_at).time}
            </Item>
            <Item className="col-span-1" />
          </Row>
        );
      })}
    </div>
  );
};
