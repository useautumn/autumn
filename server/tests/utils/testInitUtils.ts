import { createStripeCli } from "@/external/stripe/utils.js";
import { AppEnv, Organization } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { initCustomer } from "./init.js";

export const initCustomerWithTestClock = async ({
  customerId,
  org,
  env,
  sb,
  fingerprint,
}: {
  customerId: string;
  org: Organization;
  env: AppEnv;
  sb: SupabaseClient;
  fingerprint?: string;
}) => {
  const stripeCli = createStripeCli({ org: org, env: env });
  const testClock = await stripeCli.testHelpers.testClocks.create({
    frozen_time: Math.floor(Date.now() / 1000),
  });

  let customer = await initCustomer({
    customer_data: {
      id: customerId,
      name: customerId,
      email: "test@test.com",
      fingerprint,
    },
    sb: sb,
    org: org,
    env: env,
    testClockId: testClock.id,
    attachPm: true,
  });

  return { testClockId: testClock.id, customer };
};
