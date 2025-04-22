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
import { AdminHover } from "@/components/general/AdminHover";

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

  const {
    data: referrals,
    isLoading: referralsLoading,
    error: referralsError,
    mutate: referralsMutate,
  } = useAxiosSWR({
    url: `/customers/${customer_id}/referrals`,
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
        ...data,
        customer,
        products,
        invoices,
        coupons,
        discount,
        env,
        cusMutate,
        setAddCouponOpen,
        referrals,
      }}
    >
      <div className="flex w-full overflow-auto h-full ">
        <div className="flex flex-col gap-4 w-full ">
          <Breadcrumb className="text-t3 pt-6 pl-10 flex justify-start ">
            <BreadcrumbList className="text-t3 text-xs">
              <BreadcrumbItem>
                <BreadcrumbLink
                  className="cursor-pointer"
                  onClick={() => navigateTo("/customers", navigate, env)}
                >
                  <AdminHover
                    texts={[
                      {
                        key: "Internal ID",
                        value: customer.internal_id,
                      },
                      {
                        key: "Stripe ID",
                        value: customer.processor?.id,
                      },
                    ]}
                  >
                    Customers
                  </AdminHover>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem className="truncate max-w-48">
                {customer.name || customer.id || customer.email}
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="flex w-full justify-between">
            <div className="flex gap-2 w-full">
              <h2 className="flex text-lg text-t1 font-medium w-full max-w-md justify-start pl-10 truncate">
                {customer.name ? (
                  <span className="truncate">{customer.name}</span>
                ) : customer.id ? (
                  <span className="truncate font-mono">{customer.id}</span>
                ) : (
                  <span className="truncate">{customer.email}</span>
                )}
              </h2>
            </div>
            {/* <CustomerToolbar customer={customer} /> */}
          </div>
          <div className="flex w-full !pb-[50px]">
            {/* main content */}
            <div className="flex flex-col gap-10 w-full text-t2 text-sm">
              {/* <p className="text-t2 font-medium text-md">Products</p> */}
              <div className="flex flex-col gap-2">
                <CustomerProductList customer={customer} products={products} />
              </div>
              {/* <p className="text-t2 font-medium text-md">Entitlements</p> */}
              <div className="flex flex-col gap-2">
                <CustomerEntitlementsList />
              </div>
              {/* <p className="text-t2 font-medium text-md">Invoices</p> */}

              <InvoicesTable />
              <CustomerEventsList events={events} />
            </div>
            {/* customer details */}
          </div>
        </div>
        <div className="flex max-w-md w-1/3 shrink-1 hidden lg:block lg:min-w-xs sticky top-0">
          <CustomerDetails />
        </div>
      </div>
    </CustomerContext.Provider>
  );
}
