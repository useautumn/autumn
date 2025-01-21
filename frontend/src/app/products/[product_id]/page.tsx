import ProductView from "@/views/products/product/ProductView";
import { headers } from "next/headers";
import React from "react";
import { Organization, AppEnv } from "@autumn/shared";
import { getOrgFromSession } from "@/utils/serverUtils";

async function ProductPage({
  params,
}: {
  params: Promise<{ product_id: string }>;
}) {
  const headersList = await headers();
  const env = (headersList.get("env") as AppEnv) || AppEnv.Sandbox;
  const { product_id } = await params;

  const org: Organization = await getOrgFromSession();

  return <ProductView product_id={product_id} env={env} org={org} />;
}

export default ProductPage;
