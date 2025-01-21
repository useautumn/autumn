import FeaturesView from "@/views/features/FeaturesView";
import { AppEnv } from "@autumn/shared";
import { headers } from "next/headers";
import React from "react";

async function FeaturesPage() {
  const headersList = await headers();
  const env = (headersList.get("env") as AppEnv) || AppEnv.Sandbox;

  return <FeaturesView env={env} />;
}

export default FeaturesPage;
