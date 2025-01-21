import CreditSystemsView from "@/views/credits/CreditSystemsView";
import { AppEnv } from "@autumn/shared";
import { headers } from "next/headers";
import React from "react";

async function CreditPage() {
  const headersList = await headers();
  const env = (headersList.get("env") as AppEnv) || AppEnv.Sandbox;

  return <CreditSystemsView env={env} />;
}

export default CreditPage;
