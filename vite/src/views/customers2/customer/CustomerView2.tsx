"use client";

import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { pushPage } from "@/utils/genUtils";
import ErrorScreen from "@/views/general/ErrorScreen";
import LoadingScreen from "@/views/general/LoadingScreen";
import { useCusQuery } from "../../customers/customer/hooks/useCusQuery";
import { useCusReferralQuery } from "../../customers/customer/hooks/useCusReferralQuery";
import { CustomerFeatureUsageTable } from "../components/table/customer-feature-usage/CustomerFeatureUsageTable";
import { CustomerInvoicesTable } from "../components/table/customer-invoices/CustomerInvoicesTable";
import { CustomerProductsTable } from "../components/table/customer-products/CustomerProductsTable";
import { CustomerUsageAnalyticsTable } from "../components/table/customer-usage-analytics/CustomerUsageAnalyticsTable";
import { CustomerActions } from "./CustomerActions";
import { CustomerBreadcrumbs } from "./CustomerBreadcrumbs2";
import { CustomerContext } from "./CustomerContext";
import { CustomerPageDetails } from "./CustomerPageDetails";

export default function CustomerView2() {
  const [searchParams] = useSearchParams();
  const entityIdParam = searchParams.get("entity_id");

  const { customer, isLoading: cusLoading } = useCusQuery();

  useCusReferralQuery();

  const [entityId, setEntityId] = useState(entityIdParam);

  useEffect(() => {
    if (entityIdParam) {
      setEntityId(entityIdParam);
    } else {
      setEntityId(null);
    }
  }, [entityIdParam]);

  if (cusLoading) return <LoadingScreen />;

  if (!customer) {
    return (
      <ErrorScreen>
        <div className="text-t2 text-sm">Customer not found</div>
        <Link
          className="text-t3 text-xs hover:underline"
          to={pushPage({ path: "/customers" })}
        >
          Return
        </Link>
      </ErrorScreen>
    );
  }

  return (
    <CustomerContext.Provider
      value={{ customer, entityId: entityId, setEntityId }}
    >
      <div className="flex flex-col [&>*:not([data-slot=separator-root])]:px-4 [&>*:not([data-slot=separator-root])]:py-8 [&>*:not([data-slot=separator-root])]:max-w-4xl [&>*:not([data-slot=separator-root])]:mx-auto">
        <div className="flex items-end justify-between w-full gap-4">
          <div className="flex flex-col w-full">
            <CustomerBreadcrumbs />
            <h3 className="text-md font-semibold text-t2 pt-2.5 pb-2">
              {customer.name}
            </h3>
            <CustomerPageDetails />
          </div>
          <CustomerActions />
        </div>
        {/* <Separator className="my-2" /> */}
        <div className="flex flex-col gap-20 mt-4">
          <CustomerProductsTable />
          <CustomerFeatureUsageTable />
          <CustomerUsageAnalyticsTable />
          <CustomerInvoicesTable />
        </div>
      </div>
    </CustomerContext.Provider>
  );
}
