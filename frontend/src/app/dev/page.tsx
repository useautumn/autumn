import { AppEnv } from "@autumn/shared";
import { headers } from "next/headers";
import React from "react";
import DevView from "@/views/developer/DevView";

async function DevPage() {
  const headersList = await headers();
  const env = (headersList.get("env") as AppEnv) || AppEnv.Sandbox;

  return <DevView env={env} />;
}

export default DevPage;
