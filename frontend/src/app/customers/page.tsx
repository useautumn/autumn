import { AppEnv } from "@autumn/shared";
import { headers } from "next/headers";
import React from "react";

import CustomersView from "@/views/customers/CustomersView";

async function CustomersPage() {
  const headersList = await headers();
  const env = (headersList.get("env") as AppEnv) || AppEnv.Sandbox;
  return <CustomersView env={env} />;
}

export default CustomersPage;
