import CustomerProductView from "@/views/customers/customer/product/CustomerProductView";
import { AppEnv } from "@autumn/shared";
import { headers } from "next/headers";
import React from "react";
import { getOrgFromSession } from "@/utils/serverUtils";

export default async function CustomerProductPage({
  params,
}: {
  params: Promise<{ product_id: string; customer_id: string }>;
}) {
  const headersList = await headers();
  const env = (headersList.get("env") as AppEnv) || AppEnv.Sandbox;
  const org = await getOrgFromSession();

  const { product_id, customer_id } = await params;

  return (
    <CustomerProductView
      product_id={product_id}
      customer_id={customer_id}
      env={env}
      org={org}
    />
  );
}
