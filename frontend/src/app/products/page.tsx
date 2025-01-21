import { AppEnv } from "@autumn/shared";
import { headers } from "next/headers";
import React from "react";
import ProductsView from "@/views/products/ProductsView";
import { auth } from "@clerk/nextjs/server";

async function ProductsPage() {
  const headersList = await headers();
  const env = (headersList.get("env") as AppEnv) || AppEnv.Sandbox;

  return <ProductsView env={env} />;
}

export default ProductsPage;
