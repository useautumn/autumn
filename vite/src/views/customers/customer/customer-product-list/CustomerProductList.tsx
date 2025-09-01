import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { compareStatus, navigateTo, notNullish } from "@/utils/genUtils";
import { CusProduct, CusProductStatus, FullCusProduct } from "@autumn/shared";
import { useNavigate } from "react-router";
import { useCustomerContext } from "../CustomerContext";

import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";

import { AdminHover } from "@/components/general/AdminHover";
import AddProduct from "../add-product/NewProductDropdown";
import { Item, Row } from "@/components/general/TableGrid";
import { cn } from "@/lib/utils";

import { CusProductStatusItem } from "../customer-product-list/CusProductStatus";
import { CusProductEntityItem } from "../components/CusProductEntityItem";
import { CusProductToolbar } from "./CusProductToolbar";
import { MultiAttachDialog } from "../product/multi-attach/MultiAttachDialog";

export const CustomerProductList = ({
  customer,
  products,
}: {
  customer: any;
  products: any;
}) => {
  const navigate = useNavigate();
  const { env, versionCounts, entities, entityId, showEntityView } =
    useCustomerContext();

  const [showExpired, setShowExpired] = useState(false);

  const [multiAttachOpen, setMultiAttachOpen] = useState(false);

  const sortedProducts = customer.products
    .filter((p: CusProduct & { entitlements: any[] }) => {
      if (showExpired) {
        return true;
      }

      const entity = entities.find((e: any) => e.id === entityId);

      const entityMatches =
        entity && notNullish(p.internal_entity_id)
          ? p.internal_entity_id === entity.internal_id ||
            p.entitlements.some(
              (cusEnt: any) =>
                cusEnt.entities &&
                Object.keys(cusEnt.entities).includes(entity.internal_id)
            )
          : true;

      return (
        p.status !== CusProductStatus.Expired &&
        (entityId ? entityMatches : true)
      );
    })
    .sort((a: any, b: any) => {
      if (a.status !== b.status) {
        return compareStatus(a.status, b.status);
      }

      return b.created_at - a.created_at;
    });

  const getCusProductHoverTexts = (cusProduct: FullCusProduct) => {
    return [
      {
        key: "Cus Product ID",
        value: cusProduct.id,
      },
      ...(cusProduct.subscription_ids
        ? cusProduct.subscription_ids.map((id: string) => ({
            key: "Stripe Subscription ID",
            value: id,
          }))
        : []),
      ...(cusProduct.scheduled_ids
        ? [
            {
              key: "Stripe Scheduled IDs",
              value: cusProduct.scheduled_ids.join(", "),
            },
          ]
        : []),
      {
        key: "Entity ID",
        value: cusProduct.entity_id || "N/A",
      },
    ];
  };

  return (
    <div>
      <div className="flex items-center grid grid-cols-10 gap-8 justify-between border-y bg-stone-100 pl-10 pr-7 h-10">
        <h2 className="text-sm text-t2 font-medium col-span-2 flex">
          Products
        </h2>
        <div className="flex w-full h-full items-center col-span-8 justify-end">
          <div className="flex w-fit h-full items-center gap-4">
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
            {/* <CreateEntitlement buttonType={"feature"} /> */}
            <div className="flex items-center gap-0">
              <MultiAttachDialog
                open={multiAttachOpen}
                setOpen={setMultiAttachOpen}
              />
              <AddProduct setMultiAttachOpen={setMultiAttachOpen} />
            </div>
          </div>
        </div>
      </div>
      {sortedProducts.length === 0 ? (
        <div className="flex pl-10 items-center h-10">
          <p className="text-t3">Attach a product to this customer</p>
        </div>
      ) : (
        <Row
          type="header"
          className={cn("grid-cols-12 pr-0", showEntityView && "grid-cols-15")}
        >
          <Item className="col-span-3">Name</Item>
          {showEntityView && <Item className="col-span-3">Entity</Item>}
          <Item className="col-span-3">Product ID</Item>
          <Item className="col-span-3">Status</Item>
          <Item className="col-span-2">Created At</Item>
          <Item className="col-span-1" />
        </Row>
      )}
      {sortedProducts.map((cusProduct: FullCusProduct) => {
        return (
          <Row
            key={cusProduct.id}
            className={cn(
              "grid-cols-12 pr-0",
              showEntityView && "grid-cols-15"
            )}
            onClick={() => {
              const entity = entities.find(
                (e: any) => e.internal_id === cusProduct.internal_entity_id
              );
              navigateTo(
                `/customers/${customer.id || customer.internal_id}/${
                  cusProduct.product_id
                }?id=${cusProduct.id}${
                  entity ? `&entity_id=${entity.id || entity.internal_id}` : ""
                }`,
                navigate,
                env
              );
            }}
          >
            <Item className="col-span-3">
              <AdminHover texts={getCusProductHoverTexts(cusProduct)}>
                <div className="flex items-center gap-1">
                  <p>{cusProduct.product.name}</p>
                  {versionCounts[cusProduct.product.id] > 1 && (
                    <Badge
                      variant="outline"
                      className="text-xs bg-stone-50 text-t3 px-2 py-0 ml-2 font-mono"
                    >
                      v{cusProduct.product.version}
                    </Badge>
                  )}

                  {cusProduct.quantity > 1 && (
                    <Badge
                      variant="outline"
                      className="text-xs bg-stone-200 text-t3 px-2 py-0 ml-2 font-mono"
                    >
                      x{cusProduct.quantity}
                    </Badge>
                  )}
                </div>
              </AdminHover>
            </Item>
            {showEntityView && (
              <Item className="col-span-3 -translate-x-1">
                <CusProductEntityItem
                  internalEntityId={cusProduct.internal_entity_id}
                />
              </Item>
            )}
            <Item className="col-span-3 text-t3 font-mono overflow-hidden text-ellipsis">
              {cusProduct.product_id}
            </Item>
            <Item className="col-span-3">
              <CusProductStatusItem cusProduct={cusProduct} />
            </Item>
            <Item className="col-span-2 text-xs text-t3">
              {formatUnixToDateTime(cusProduct.created_at).date}{" "}
              {formatUnixToDateTime(cusProduct.created_at).time}
            </Item>
            <Item className="col-span-1 pr-4 flex items-center justify-center">
              {cusProduct.status !== CusProductStatus.Expired && (
                <CusProductToolbar cusProduct={cusProduct} />
              )}
            </Item>
          </Row>
        );
      })}
    </div>
  );
};
