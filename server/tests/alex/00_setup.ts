import { createSupabaseClient } from "@/external/supabaseUtils.js";
import { AppEnv } from "@autumn/shared";
import { clearOrg, setupOrg } from "tests/utils/setup.js";
import { alexFeatures, alexProducts } from "./init.js";

const ORG_SLUG = "unit-test-org";
const DEFAULT_ENV = AppEnv.Sandbox;

describe("Initialize org for tests", () => {
  it("should initialize org", async function () {
    this.timeout(20000);

    this.org = await clearOrg({ orgSlug: ORG_SLUG, env: DEFAULT_ENV });
    this.env = DEFAULT_ENV;
    await setupOrg({
      orgId: this.org.id,
      env: DEFAULT_ENV,
      features: { ...alexFeatures } as any,
      products: { ...alexProducts },
      rewards: {},
      rewardTriggers: {},
    });

    console.log("--------------------------------");
  });
});
