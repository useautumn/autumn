"use client";

import { useAxiosSWR } from "@/services/useAxiosSwr";
import LoadingScreen from "@/views/general/LoadingScreen";
import {
  AppEnv,
  FeatureType,
  FullCustomerEntitlement,
  Organization,
} from "@autumn/shared";
import { BreadcrumbItem } from "@nextui-org/react";
import { Breadcrumbs } from "@nextui-org/react";
import { CustomerContext } from "./CustomerContext";
import { useRouter } from "next/navigation";
import CopyButton from "@/components/general/CopyButton";
import { CustomerToolbar } from "./CustomerToolbar";

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
import { faSquareUpRight } from "@fortawesome/pro-duotone-svg-icons";
import { CustomerProductList } from "./CustomerProductList";
import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { ManageEntitlements } from "./entitlements/ManageEntitlements";
import { CustomerEntitlementsList } from "./entitlements/CustomerEntitlementsList";
import { navigateTo } from "@/utils/genUtils";

export default function CustomerView({
  customer_id,
  env,
}: {
  customer_id: string;
  env: AppEnv;
}) {
  const router = useRouter();
  const { data, isLoading, error } = useAxiosSWR({
    url: `/customers/${customer_id}/data`,
    env,
  });

  if (error) {
    router.push("/customers");
  }

  if (isLoading) return <LoadingScreen />;
  const { customer, products, invoices } = data;

  return (
    <CustomerContext.Provider value={{ customer, products, env }}>
      <CustomToaster />
      <div className="flex flex-col gap-1">
        <Breadcrumbs className="text-t3">
          <BreadcrumbItem
            onClick={() => navigateTo("/customers", router, env)}
            size="sm"
          >
            Customers
          </BreadcrumbItem>
          <BreadcrumbItem size="sm">{customer.name}</BreadcrumbItem>
        </Breadcrumbs>
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <h2 className="text-lg text-t1 font-medium">{customer.name}</h2>
          </div>
          <CustomerToolbar customer={customer} />
        </div>
      </div>
      <div className="flex justify-between gap-4">
        {/* main content */}
        <div className="flex flex-col gap-4 text-t2 text-sm w-full">
          <p className="text-t2 font-medium text-md">Products</p>
          <div className="flex flex-col gap-1">
            <CustomerProductList customer={customer} products={products} />
            <AddProduct />
          </div>
          <p className="text-t2 font-medium text-md">Entitlements</p>
          <div className="flex flex-col gap-1">
            <Tabs defaultValue="metered">
              <TabsList className="bg-transparent">
                <TabsTrigger
                  value="metered"
                  className="text-t2 text-xs font-normal"
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
              <TabsContent value="metered">
                <CustomerEntitlementsList
                  customer={{
                    ...customer,
                    entitlements: customer.entitlements.filter(
                      (cusEnt: FullCustomerEntitlement) => {
                        const featureType = cusEnt.entitlement.feature.type;
                        return (
                          featureType === FeatureType.Metered ||
                          featureType === FeatureType.CreditSystem
                        );
                      }
                    ),
                  }}
                />
              </TabsContent>
              <TabsContent value="boolean">
                <CustomerEntitlementsList
                  customer={{
                    ...customer,
                    entitlements: customer.entitlements.filter(
                      (cusEnt: FullCustomerEntitlement) => {
                        const featureType = cusEnt.entitlement.feature.type;
                        return featureType === FeatureType.Boolean;
                      }
                    ),
                  }}
                />
              </TabsContent>
            </Tabs>
            <ManageEntitlements />
          </div>

          <p className="text-t2 font-medium text-md">Invoices</p>
          <Table className="p-2">
            <TableHeader>
              <TableRow className="bg-white">
                <TableHead className="w-[150px]">Products</TableHead>
                <TableHead className="">URL</TableHead>
                <TableHead className="">Created At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell>
                    {invoice.product_ids
                      .map((p: string) => {
                        return products.find((product) => product.id === p)
                          ?.name;
                      })
                      .join(", ")}
                  </TableCell>
                  <TableCell className="max-w-[400px] truncate">
                    <a
                      href={invoice.processor.hosted_invoice_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-lime-500"
                    >
                      View Invoice
                      <FontAwesomeIcon icon={faSquareUpRight} />
                    </a>
                  </TableCell>
                  <TableCell>
                    {formatUnixToDateTime(invoice.created_at).date}
                    <span className="text-t3">
                      {" "}
                      {formatUnixToDateTime(invoice.created_at).time}{" "}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {/* customer details */}
        <div className="flex flex-col gap-4 text-t2 text-sm  w-full max-w-[400px] h-fit">
          <h2 className="text-t2 font-medium text-md">Customer Details</h2>

          <div className="grid grid-cols-[auto_1fr] gap-y-3 gap-x-4 w-full truncate items-center rounded-md px-4">
            <p className="text-t3 text-xs font-medium">Name</p>
            <p>{customer.name}</p>

            <p className="text-t3 text-xs font-medium">ID</p>
            <p className="flex items-center gap-1 font-mono">
              {customer.id} <CopyButton text={customer.id} />
            </p>

            <p className="text-t3 text-xs font-medium">Email</p>
            <p className="border border-blue-500 text-blue-500 rounded-md px-2 py-0.5 w-fit">
              {customer.email}
            </p>

            <p className="text-t3 text-xs font-medium">Products</p>
            <p>
              {customer.products
                .map(
                  (p) => products.find((prod) => prod.id === p.product_id)?.name
                )
                .join(", ")}
            </p>
          </div>
        </div>
      </div>
    </CustomerContext.Provider>
  );
}
