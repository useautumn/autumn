"use client";

import { useAxiosSWR } from "@/services/useAxiosSwr";
import LoadingScreen from "@/views/general/LoadingScreen";
import { AppEnv, FeatureType } from "@autumn/shared";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { CustomerContext } from "./CustomerContext";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { CustomerToolbar } from "./CustomerToolbar";
import { Switch } from "@/components/ui/switch";
import AddProduct from "./add-product/NewProductDropdown";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import { CustomerProductList } from "./CustomerProductList";

import { CustomerEntitlementsList } from "./entitlements/CustomerEntitlementsList";
import { getRedirectUrl, navigateTo } from "@/utils/genUtils";
import { CustomerEventsList } from "./product/CustomerEventsList";
import { useState } from "react";

import ErrorScreen from "@/views/general/ErrorScreen";
import { InvoicesTable } from "./InvoicesTable";
import { CustomerDetails } from "./CustomerDetails";

export default function CustomerView({ env }: { env: AppEnv }) {
  const { customer_id } = useParams();

  const navigate = useNavigate();

  const {
    data,
    isLoading,
    error,
    mutate: cusMutate,
  } = useAxiosSWR({
    url: `/customers/${customer_id}/data`,
    env,
  });

  const [addCouponOpen, setAddCouponOpen] = useState(false);

  const [showExpired, setShowExpired] = useState(false);

  if (isLoading) return <LoadingScreen />;

  // if (error) {
  //   router.push("/customers");
  //   return;
  // }

  if (!data) {
    return (
      <ErrorScreen>
        <div className="text-t2 text-sm">Customer not found</div>
        <Link
          className="text-t3 text-xs hover:underline"
          to={getRedirectUrl("/customers", env)}
        >
          Return
        </Link>
      </ErrorScreen>
    );
  }

  const { customer, products, invoices, coupons, discount, events } = data;

  return (
    <CustomerContext.Provider
      value={{
        customer,
        products,
        invoices,
        coupons,
        discount,
        env,
        cusMutate,
        setAddCouponOpen,
      }}
    >
      <div className="p-6 flex flex-col gap-4 max-w-[1048px]">
        <div className="flex flex-col gap-1">
          <Breadcrumb>
            <BreadcrumbList className="text-t3 text-xs">
              <BreadcrumbItem>
                <BreadcrumbLink
                  className="cursor-pointer"
                  onClick={() => navigateTo("/customers", navigate, env)}
                >
                  Customers
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {customer.name ? customer.name : customer.id}
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="flex items-center justify-between">
            <div className="flex gap-2 max-w-2/3 w-2/3">
              <h2 className="flex text-lg text-t1 font-medium gap-2 w-full justify-start">
                {customer.name && (
                  <span className="min-w-0 max-w-[50%] truncate">
                    {customer.name}
                  </span>
                )}
                <span className="min-w-0 max-w-[50%] truncate font-mono text-t3">
                  {customer.id}
                </span>
              </h2>
            </div>
            <CustomerToolbar customer={customer} />
          </div>
        </div>
        <div className="flex justify-between gap-4 !pb-[50px]">
          {/* main content */}
          <div className="flex flex-col gap-4 text-t2 text-sm w-2/3">
            <p className="text-t2 font-medium text-md">Products</p>
            <div className="flex flex-col gap-2">
              <CustomerProductList customer={customer} products={products} />
              <AddProduct />
            </div>
            <p className="text-t2 font-medium text-md">Entitlements</p>
            <div className="flex flex-col gap-2">
              <Tabs defaultValue="metered">
                <div className="flex justify-between items-center">
                  <TabsList className="bg-transparent h-fit">
                    <TabsTrigger
                      value="metered"
                      className="text-t2 text-xs font-normal "
                    >
                      Metered Features
                    </TabsTrigger>
                    <TabsTrigger
                      value="boolean"
                      className="text-t2 text-xs font-normal"
                    >
                      Boolean Features
                    </TabsTrigger>
                  </TabsList>
                  <div className="flex items-center gap-2">
                    <p className="text-t3 text-xs">Show Expired</p>
                    <Switch
                      checked={showExpired}
                      className="bg-primary"
                      onCheckedChange={setShowExpired}
                    />
                  </div>
                </div>
                <TabsContent value="metered">
                  <CustomerEntitlementsList
                    featureType={FeatureType.Metered}
                    showExpired={showExpired}
                  />
                </TabsContent>
                <TabsContent value="boolean">
                  <CustomerEntitlementsList
                    featureType={FeatureType.Boolean}
                    showExpired={showExpired}
                  />
                </TabsContent>
              </Tabs>
            </div>
            <p className="text-t2 font-medium text-md">Invoices</p>
            {invoices.length === 0 ? (
              <p className="text-t3 text-sm italic">No invoices found</p>
            ) : (
              <InvoicesTable />
            )}
            <p className="text-t2 font-medium text-md">Events</p>
            {events && events.length === 0 ? (
              <p className="text-t3 text-sm italic">No events found</p>
            ) : (
              <CustomerEventsList events={events} />
            )}
          </div>
          {/* customer details */}
          <div className="flex flex-col gap-4 text-t2 text-sm w-1/3 max-w-[400px] h-fit">
            <CustomerDetails />
          </div>
        </div>
      </div>
    </CustomerContext.Provider>
  );
}
