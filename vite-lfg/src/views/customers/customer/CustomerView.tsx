"use client";

import { useAxiosSWR } from "@/services/useAxiosSwr";
import LoadingScreen from "@/views/general/LoadingScreen";
import { AppEnv, FeatureType, FullCustomerEntitlement } from "@autumn/shared";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { CustomerContext } from "./CustomerContext";
import { useRouter } from "next/navigation";
import CopyButton from "@/components/general/CopyButton";
import { CustomerToolbar } from "./CustomerToolbar";
import { Switch } from "@/components/ui/switch";
import { CustomToaster } from "@/components/general/CustomToaster";
import AddProduct from "./add-product/NewProductDropdown";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowUpRightFromSquare,
  faSquareUpRight,
} from "@fortawesome/pro-duotone-svg-icons";
import { CustomerProductList } from "./CustomerProductList";
import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { ManageEntitlements } from "./entitlements/ManageEntitlements";
import { CustomerEntitlementsList } from "./entitlements/CustomerEntitlementsList";
import { getRedirectUrl, navigateTo } from "@/utils/genUtils";
import { CustomerEventsList } from "./product/CustomerEventsList";
import { useState } from "react";
import Link from "next/link";
import { faStripe, faStripeS } from "@fortawesome/free-brands-svg-icons";
import { getStripeCusLink } from "@/utils/linkUtils";
import { Button } from "@/components/ui/button";
import ErrorScreen from "@/views/general/ErrorScreen";
import { InvoicesTable } from "./InvoicesTable";
import { CustomerDetails } from "./CustomerDetails";
import AddCoupon from "./add-coupon/AddCouponDialogContent";

export default function CustomerView({
  customer_id,
  env,
}: {
  customer_id: string;
  env: AppEnv;
}) {
  const router = useRouter();
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
          href={getRedirectUrl("/customers", env)}
        >
          Return
        </Link>
      </ErrorScreen>
    );
  }

  const { customer, products, invoices, coupons, events, discount } = data;

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
      <CustomToaster />
      <div className="flex flex-col gap-1">
        <Breadcrumb>
          <BreadcrumbList className="text-t3 text-xs">
            <BreadcrumbItem>
              <BreadcrumbLink
                className="cursor-pointer"
                onClick={() => navigateTo("/customers", router, env)}
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
              <span className="min-w-0 max-w-[50%] truncate">
                {customer.name}
              </span>
              <span className="min-w-0 max-w-[50%] truncate font-mono text-t3">
                {customer.id}
              </span>
            </h2>
          </div>
          <CustomerToolbar customer={customer} />
        </div>
      </div>
      <div className="flex justify-between gap-4">
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
          {events.length === 0 ? (
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
    </CustomerContext.Provider>
  );
}
