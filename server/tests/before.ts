import dotenv from "dotenv";
dotenv.config();

import { createSupabaseClient } from "@/external/supabaseUtils.js";
import { AppEnv } from "@autumn/shared";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { Autumn } from "@/external/autumn/autumnCli.js";
import { createStripeCli } from "@/external/stripe/utils.js";

const ORG_SLUG = "unit-test-org";
const DEFAULT_ENV = AppEnv.Sandbox;

export const setupBefore = async (instance: any) => {
  const sb = createSupabaseClient();
  const org = await OrgService.getBySlug({sb, slug: ORG_SLUG});
  const env = DEFAULT_ENV;
  const autumnSecretKey = process.env.UNIT_TEST_AUTUMN_SECRET_KEY!;
  const autumn = new Autumn(autumnSecretKey);
  const stripeCli = createStripeCli({org, env});
  instance.sb = sb;
  instance.org = org;
  instance.env = env;
  instance.autumn = autumn;
  instance.stripeCli = stripeCli;
}