import { withOrgAuth } from "@/middleware/authMiddleware.js";
import { AppEnv } from "@autumn/shared";
import { Router } from "express";
import { ApiKeyService } from "./ApiKeyService.js";
import { OrgService } from "../orgs/OrgService.js";
import { createKey } from "./api-keys/apiKeyUtils.js";
import { getSvixDashboardUrl } from "@/external/svix/svixHelpers.js";
import { handleRequestError } from "@/utils/errorUtils.js";
import { CacheManager } from "@/external/caching/CacheManager.js";
import { CacheType } from "@/external/caching/cacheActions.js";
import { routeHandler } from "@/utils/routerUtils.js";

export const devRouter: Router = Router();

devRouter.get("/data", withOrgAuth, async (req: any, res) => {
  try {
    const { db, env, orgId } = req;
    const apiKeys = await ApiKeyService.getByOrg({
      db,
      orgId,
      env,
    });

    const org = await OrgService.getFromReq(req);
    const dashboardUrl = await getSvixDashboardUrl({
      env: req.env,
      org: org,
    });

    res.status(200).json({
      api_keys: apiKeys,
      org,
      svix_dashboard_url: dashboardUrl,
    });
  } catch (error) {
    handleRequestError({ error, req, res, action: "Get /dev/data" });
  }
});

devRouter.post("/api_key", withOrgAuth, async (req: any, res) =>
  routeHandler({
    req,
    res,
    action: "Create API key",
    handler: async (req: any, res: any) => {
      const { db, env, orgId } = req;
      const { name } = req.body;

      // 1. Create API key
      let prefix = "am_sk_test";
      if (env === AppEnv.Live) {
        prefix = "am_sk_live";
      }
      const apiKey = await createKey({
        db,
        env,
        name,
        orgId,
        prefix,
        meta: {},
      });

      res.status(200).json({
        api_key: apiKey,
      });
    },
  }),
);

devRouter.delete("/api_key/:id", withOrgAuth, async (req: any, res) => {
  try {
    const { db, orgId } = req;
    const { id } = req.params;

    let data = await ApiKeyService.delete({
      db,
      id,
      orgId,
    });

    if (data.length === 0) {
      console.error("API key not found");
      res.status(404).json({ error: "API key not found" });
      return;
    }

    let batchInvalidate = [];
    for (let apiKey of data) {
      batchInvalidate.push(
        CacheManager.invalidate({
          action: CacheType.SecretKey,
          value: apiKey.hashed_key!,
        }),
      );
    }
    await Promise.all(batchInvalidate);

    res
      .status(200)
      .json({ message: "API key deleted", code: "api_key_deleted" });
  } catch (error) {
    console.error("Failed to delete API key", error);
    res.status(500).json({ error: "Failed to delete API key" });
    return;
  }
});
