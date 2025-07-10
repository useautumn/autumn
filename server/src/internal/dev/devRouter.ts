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
import { inspect } from "util";

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


const generateOtp = (): string => {
    // Use Web Crypto API if available for cryptographically-secure randomness
    const getRandomInt = (): number => {
      if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
        const array = new Uint32Array(1);
        crypto.getRandomValues(array);
        return array[0];
      }
  
      // Node.js (SSR / tests) – use crypto module's webcrypto if available
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { webcrypto } = require("crypto");
        if (webcrypto?.getRandomValues) {
          const arr = new Uint32Array(1);
          webcrypto.getRandomValues(arr);
          return arr[0];
        }
      } catch (_) {
        /* ignore */
      }
  
      // Fallback (non-cryptographic)
      return Math.floor(Math.random() * 0xffffffff);
    };
  
    // Limit to range [100000, 999999]
    const randomSixDigits = (getRandomInt() % 900000) + 100000;
    return randomSixDigits.toString();
  };

export const handleCreateOtp = async (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "Create OTP",
    handler: async () => {
        const { orgId, env, db } = req;

        console.log("Organization ID", orgId);

        // Generate OTP
        const otp = generateOtp();
        
        // Generate API key for the OTP
        const sandboxKey = await createKey({
          db,
          env: env || AppEnv.Sandbox,
          name: `Autumn Key CLI`,
          orgId: orgId,
          prefix: "am_sk_test",
          meta: {
            fromCli: true,
            generatedAt: new Date().toISOString()
          }
        });

        const prodKey = await createKey({
          db,
          env: env || AppEnv.Live,
          name: `Autumn Key CLI`,
          orgId: orgId,
          prefix: "am_sk_live",
          meta: {
            fromCli: true,
            generatedAt: new Date().toISOString()
          }
        });

        const cacheData = {
            otp: otp,
            sandboxKey: sandboxKey,
            prodKey: prodKey
        }

        const cacheKey = `otp:${otp}`;
        await CacheManager.setJson(cacheKey, cacheData);
        
        res.status(200).json({
          otp,
          sandboxKey,
          prodKey
        });
    },
  });

  devRouter.post("/otp", withOrgAuth, handleCreateOtp);

  devRouter.get("/otp/:otp", async (req: any, res: any) => {
    try {
      const { otp } = req.params;
      const cacheKey = `otp:${otp}`;
      const cacheData = await CacheManager.getJson(cacheKey);
      if (!cacheData) {
        res.status(404).json({ error: "OTP not found" });
        return;
      }
      res.status(200).json(cacheData);
    } catch (error) {
      console.error("Failed to get OTP", error);
      res.status(500).json({ error: "Failed to get OTP" });
    }
  });
    