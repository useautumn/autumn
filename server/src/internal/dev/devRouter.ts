import { deleteKey } from "@/external/unkeyUtils.js";
import { withOrgAuth } from "@/middleware/authMiddleware.js";
import { AppEnv } from "@autumn/shared";
import { Router } from "express";
import { ApiKeyService } from "./ApiKeyService.js";
import { OrgService } from "../orgs/OrgService.js";
import { createKey } from "./api-keys/apiKeyUtils.js";
import { SupabaseClient } from "@supabase/supabase-js";
import { getSvixDashboardUrl } from "@/external/svix/svixUtils.js";
import { handleRequestError } from "@/utils/errorUtils.js";

export const devRouter = Router();

export const handleCreateApiKey = async ({
  sb,
  env,
  name,
  orgId,
  orgSlug,
}: {
  sb: SupabaseClient;
  env: AppEnv;
  name: string;
  orgId: string;
  orgSlug: string;
}) => {
  // 1. Create API key
  let prefix = "am_sk_test";
  if (env === AppEnv.Live) {
    prefix = "am_sk_live";
  }

  const apiKey = await createKey({
    sb,
    env,
    name,
    orgId,
    prefix,
    meta: {
      org_slug: orgSlug,
    },
  });

  return apiKey;
};

devRouter.get("/data", withOrgAuth, async (req: any, res) => {
  try {
    const apiKeys = await ApiKeyService.getByOrg(req.sb, req.orgId, req.env);
    const org = await OrgService.getFullOrg({ sb: req.sb, orgId: req.orgId });

    // Get svix dashboard url
    // let svixDashboardUrl = null;
    // try {
    //   svixDashboardUrl = await getSvixDashboardUrl({
    //     org,
    //     env: req.env,
    //   });
    // } catch (error) {
    //   console.error("Failed to get svix dashboard url", error);
    // }

    res.status(200).json({
      api_keys: apiKeys,
      org,
    });
  } catch (error) {
    handleRequestError({ error, req, res, action: "Get /dev/data" });
  }
});

devRouter.post("/api_key", withOrgAuth, async (req: any, res) => {
  const env = req.env;
  const orgId = req.orgId;
  const { name } = req.body;

  // 1. Create API key
  let prefix = "am_sk_test";
  if (env === AppEnv.Live) {
    prefix = "am_sk_live";
  }
  const apiKey = await createKey({
    sb: req.sb,
    env,
    name,
    orgId,
    prefix,
    meta: {
      org_slug: req.minOrg.slug,
    },
  });

  res.status(200).json({
    api_key: apiKey,
  });
});

devRouter.delete("/api_key/:id", withOrgAuth, async (req: any, res) => {
  const { id } = req.params;
  try {
    let count = await ApiKeyService.deleteStrict(req.sb, id, req.orgId);
    if (count === 0) {
      console.error("API key not found");
      res.status(404).json({ error: "API key not found" });
      return;
    }
  } catch (error) {
    console.error("Failed to delete API key", error);
    res.status(500).json({ error: "Failed to delete API key" });
    return;
  }

  res.status(200).json({ message: "API key deleted" });
});

// am_live_3ZaPDgqt7K4GkdirAU9oDFT3
// am_test_3ZTRcHdEsdAdoxvSUGL8L35x
