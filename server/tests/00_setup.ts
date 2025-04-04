import { createSupabaseClient } from "@/external/supabaseUtils.js";
import { AppEnv } from "@autumn/shared";
import { clearOrg, setupOrg } from "tests/utils/setup.js";
import {
  features,
  products,
  creditSystems,
  advanceProducts,
  attachProducts,
  coupons,
  oneTimeProducts,
  entityProducts,
} from "./global.js";

const ORG_SLUG = "unit-test-org";
const DEFAULT_ENV = AppEnv.Sandbox;

describe("Initialize org for tests", () => {
  it("should initialize org", async function () {
    this.timeout(1000000000);
    this.org = await clearOrg({ orgSlug: ORG_SLUG, env: DEFAULT_ENV });
    this.env = DEFAULT_ENV;
    this.sb = createSupabaseClient();
    await setupOrg({
      orgId: this.org.id,
      env: DEFAULT_ENV,
      features: { ...features, ...creditSystems } as any,
      products: {
        ...products,
        ...advanceProducts,
        ...attachProducts,
        ...oneTimeProducts,
        ...entityProducts,
      } as any,
      coupons: { ...coupons } as any,
    });

    console.log("--------------------------------");
  });
});