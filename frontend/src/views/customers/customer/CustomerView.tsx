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

  const {
    data: eventsData,
    isLoading: eventsLoading,
    error: eventsError,
  } = useAxiosSWR({
    url: `/v1/customers/${customer_id}/events`,
    env,
  });

  const [showExpired, setShowExpired] = useState(false);

  if (isLoading || eventsLoading) return <LoadingScreen />;

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

  const { customer, products, invoices } = data;
  const { events } = eventsData;

  return (
    <CustomerContext.Provider value={{ customer, products, env, cusMutate }}>
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
            <Table className="p-2">
              <TableHeader>
                <TableRow className="bg-white">
                  <TableHead className="">Products</TableHead>
                  <TableHead className="">Total</TableHead>
                  <TableHead className="">Status</TableHead>
                  <TableHead className="min-w-0 w-28">Created At</TableHead>
                  <TableHead className="min-w-0 w-6"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow
                    key={invoice.id}
                    onClick={() => {
                      // navigateTo(invoice.hosted_invoice_url, router, env);
                      window.open(invoice.hosted_invoice_url, "_blank");
                    }}
                    className="cursor-pointer"
                  >
                    <TableCell>
                      {invoice.product_ids
                        .map((p: string) => {
                          return products.find((product) => product.id === p)
                            ?.name;
                        })
                        .join(", ")}
                    </TableCell>
                    {/* <TableCell>
                      <a
                        href={invoice.hosted_invoice_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-lime-500"
                      >
                        View Invoice
                        <FontAwesomeIcon icon={faSquareUpRight} />
                      </a>
                    </TableCell> */}
                    <TableCell>
                      {invoice.total.toFixed(2)}{" "}
                      {invoice.currency.toUpperCase()}
                    </TableCell>
                    <TableCell>{invoice.status}</TableCell>
                    <TableCell>
                      {formatUnixToDateTime(invoice.created_at).date}
                      <span className="text-t3">
                        {" "}
                        {formatUnixToDateTime(invoice.created_at).time}{" "}
                      </span>
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
          <h2 className="text-t2 font-medium text-md">Customer Details</h2>

          <div className="grid grid-cols-[auto_1fr] gap-y-3 gap-x-4 w-full items-center rounded-md px-4 break-all">
            <p className="text-t3 text-xs font-medium">Name</p>
            <div className="flex gap-2">
              {/* <p>{customer.name}</p> */}
              <p>{customer.name}</p>
            </div>

            <p className="text-t3 text-xs font-medium">ID</p>
            <p className="flex items-center gap-1 font-mono ">
              {customer.id} <CopyButton text={customer.id} />
            </p>

            <p className="text-t3 text-xs font-medium">Email</p>
            {customer.email ? (
              <p className="border border-blue-500 text-blue-500 px-2 py-0.5 w-fit">
                {customer.email}
              </p>
            ) : (
              <p className="text-t3 text-xs font-medium">N/A</p>
            )}

            <p className="text-t3 text-xs font-medium">Fingerprint</p>
            <p>{customer.fingerprint}</p>

            <p className="text-t3 text-xs font-medium">Products</p>
            <p>
              {customer.products
                .map(
                  (p) => products.find((prod) => prod.id === p.product_id)?.name
                )
                .join(", ")}
            </p>

            {customer.processor?.id && (
              <Link
                className="!cursor-pointer hover:underline"
                href={getStripeCusLink(customer.processor?.id, env)}
                target="_blank"
              >
                <div className="flex justify-center items-center w-fit gap-2">
                  <FontAwesomeIcon
                    icon={faStripe}
                    className="text-[#675DFF] h-6"
                  />
                  <FontAwesomeIcon
                    icon={faArrowUpRightFromSquare}
                    className="text-[#675DFF]"
                    size="xs"
                  />
                </div>
              </Link>
            )}
          </div>
        </div>
      </div>
    </CustomerContext.Provider>
  );
}
