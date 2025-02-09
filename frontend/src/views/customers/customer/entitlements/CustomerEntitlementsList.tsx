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
  CusEntWithFeatureAndEntitlement,
  FeatureType,
  FullCustomerEntitlement,
} from "@autumn/shared";

import { useCustomerContext } from "../CustomerContext";
import {
  formatUnixToDateTime,
  formatUnixToDateTimeString,
} from "@/utils/formatUtils/formatDateUtils";
import { compareStatus } from "@/utils/genUtils";
import { StatusBadge } from "../../StatusBadge";
import { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogHeader,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DialogTrigger } from "@/components/ui/dialog";
import UpdateCusEntitlement from "./UpdateCusEntitlement";
import { Badge } from "@/components/ui/badge";

export const CustomerEntitlementsList = ({
  featureType,
  showExpired,
}: {
  featureType: FeatureType;
  showExpired: boolean;
}) => {
  const { products, customer } = useCustomerContext();
  const [selectedCusEntitlement, setSelectedCusEntitlement] =
    useState<FullCustomerEntitlement | null>(null);

  const filteredEntitlements = customer.entitlements.filter(
    (cusEnt: FullCustomerEntitlement) => {
      const entFeatureType = cusEnt.entitlement.feature.type;
      const cusProduct = customer.products.find(
        (p) => p.id === cusEnt.customer_product_id
      );
      const isExpired = cusProduct?.status === "expired";

      // Filter by feature type
      const featureTypeMatches =
        featureType === FeatureType.Boolean
          ? entFeatureType === FeatureType.Boolean
          : entFeatureType === FeatureType.Metered ||
            entFeatureType === FeatureType.CreditSystem;

      // Filter by expired status
      const expiredStatusMatches = showExpired ? true : !isExpired;

      return featureTypeMatches && expiredStatusMatches;
    }
  );

  const getProductName = (cusEnt: FullCustomerEntitlement) => {
    const cusProduct = customer.products.find(
      (p: any) => p.id === cusEnt.customer_product_id
    );

    const product = products.find((p: any) => p.id === cusProduct?.product_id);

    return product?.name;
  };

  const sortedEntitlements = filteredEntitlements.sort((a: any, b: any) => {
    const statusA = customer.products.find(
      (cp: any) => cp.id === a.customer_product_id
    )?.status;

    const statusB = customer.products.find(
      (cp: any) => cp.id === b.customer_product_id
    )?.status;

    if (statusA !== statusB) {
      return compareStatus(statusA, statusB);
    }

    const productA = customer.products.find(
      (cp: any) => cp.id === a.customer_product_id
    );

    const productB = customer.products.find(
      (cp: any) => cp.id === b.customer_product_id
    );

    return productA.product.name.localeCompare(productB.product.name);
  });

  const handleSelectCusEntitlement = (cusEnt: FullCustomerEntitlement) => {
    setSelectedCusEntitlement(cusEnt);
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
            <TableHead className="">Product</TableHead>
            <TableHead className="">Feature</TableHead>
            <TableHead className="">
              {featureType === FeatureType.Metered && "Balance"}
            </TableHead>
            <TableHead className="min-w-0 w-24">
              {featureType === FeatureType.Metered && "Next Reset"}
            </TableHead>
            {/* <TableHead className="">Status</TableHead> */}
            <TableHead className="min-w-0 w-6"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedEntitlements.map((cusEnt: FullCustomerEntitlement) => {
            const entitlement = cusEnt.entitlement;
            const allowanceType = entitlement.allowance_type;
            return (
              <TableRow
                key={cusEnt.id}
                onClick={() => handleSelectCusEntitlement(cusEnt)}
                className="cursor-pointer"
              >
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
                <TableCell>{entitlement.feature.name}</TableCell>
                <TableCell>
                  {allowanceType == AllowanceType.Unlimited
                    ? "Unlimited"
                    : allowanceType == AllowanceType.None
                    ? "None"
                    : cusEnt.balance}
                </TableCell>
                <TableCell>
                  <span>{formatUnixToDateTime(cusEnt.next_reset_at).date}</span>{" "}
                  <span className="text-t3">
                    {formatUnixToDateTime(cusEnt.next_reset_at).time}
                  </span>
                </TableCell>
                <TableCell></TableCell>
                {/* <TableCell>
                  <StatusBadge
                    status={
                      customer.products.find(
                        (p: any) => p.id === cusEnt.customer_product_id
                      )?.status
                    }
                  />
                </TableCell> */}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};
