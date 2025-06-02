import { DrizzleCli } from "@/db/initDrizzle.js";
import {
  AppEnv,
  customers,
  features,
  Organization,
  products,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";

export const clearOrg = async ({
  db,
  org,
}: {
  db: DrizzleCli;
  org: Organization;
}) => {
  await db
    .delete(customers)
    .where(
      and(eq(customers.org_id, org.id), eq(customers.env, AppEnv.Sandbox)),
    );

  console.log("Cleared customers");

  await db
    .delete(products)
    .where(and(eq(products.org_id, org.id), eq(products.env, AppEnv.Sandbox)));

  console.log("Cleared products");

  await db
    .delete(features)
    .where(and(eq(features.org_id, org.id), eq(features.env, AppEnv.Sandbox)));

  console.log("Cleared features");
};
