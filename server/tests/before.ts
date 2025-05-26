import dotenv from "dotenv";
dotenv.config();

import { createSupabaseClient } from "@/external/supabaseUtils.js";
import { AppEnv } from "@autumn/shared";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { Autumn } from "@/external/autumn/autumnCli.js";
import { Autumn as AutumnJS } from "autumn-js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { initDrizzle } from "@/db/initDrizzle.js";
import { after } from "mocha";

const ORG_SLUG = "unit-test-org";
const DEFAULT_ENV = AppEnv.Sandbox;

export const setupBefore = async (instance: any) => {
  const sb = createSupabaseClient();
  const org = await OrgService.getBySlug({ sb, slug: ORG_SLUG });
  const env = DEFAULT_ENV;
  const autumnSecretKey = process.env.UNIT_TEST_AUTUMN_SECRET_KEY!;
  const autumn = new Autumn(autumnSecretKey);

  const { db, client } = initDrizzle();

  const autumnJs = new AutumnJS({
    secretKey: autumnSecretKey,
    url: "http://localhost:8080/v1",
  });

  const stripeCli = createStripeCli({ org, env });
  instance.sb = sb;
  instance.org = org;
  instance.env = env;
  instance.autumn = autumn;
  instance.stripeCli = stripeCli;
  instance.autumnJs = autumnJs;
  instance.db = db;
  instance.client = client;

  // Return a cleanup function
  after(async () => {
    await instance.client?.end();
  });
};
