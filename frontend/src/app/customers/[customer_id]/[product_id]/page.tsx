import CustomerProductView from "@/views/customers/customer/product/CustomerProductView";
import { AppEnv } from "@autumn/shared";
import { headers } from "next/headers";
import React from "react";
import { getOrgFromSession } from "@/utils/serverUtils";

export default async function CustomerProductPage({
  params,
}: {
  params: { product_id: string; customer_id: string };// explicitly type the expected query param
}) {

  const headersList = await headers();
  const env = (headersList.get("env") as AppEnv) || AppEnv.Sandbox;
  const org = await getOrgFromSession();

  return (
    <CustomerProductView
      product_id={params.product_id}
      customer_id={params.customer_id}
      env={env}
      org={org}
    />
  );
}
