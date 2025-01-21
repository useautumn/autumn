import CustomerView from "@/views/customers/customer/CustomerView";
import { headers } from "next/headers";

import { AppEnv } from "@autumn/shared";

export default async function CustomerPage({
  params,
}: {
  params: Promise<{ customer_id: string }>;
}) {
  const headersList = await headers();
  const env = (headersList.get("env") as AppEnv) || AppEnv.Sandbox;
  const { customer_id } = await params;

  return <CustomerView customer_id={customer_id} env={env} />;
}
