import { Hono } from "hono";
import { adminAuthMiddleware } from "../honoMiddlewares/adminAuthMiddleware";
import { analyticsMiddleware } from "../honoMiddlewares/analyticsMiddleware";
import { apiVersionMiddleware } from "../honoMiddlewares/apiVersionMiddleware";
import { betterAuthMiddleware } from "../honoMiddlewares/betterAuthMiddleware";
import { orgConfigMiddleware } from "../honoMiddlewares/orgConfigMiddleware";
import { queryMiddleware } from "../honoMiddlewares/queryMiddleware";
import { refreshCacheMiddleware } from "../honoMiddlewares/refreshCacheMiddleware";
import type { HonoEnv } from "../honoUtils/HonoEnv";
import { honoAdminRouter } from "../internal/admin/adminRouter";
import { internalCusRouter } from "../internal/customers/internalCusRouter";
import { consentRouter } from "../internal/dev/consent/consentRouter";
import { internalDevRouter } from "../internal/dev/devRouter";
import { internalOrgRouter } from "../internal/orgs/orgRouter";
import { internalProductRouter } from "../internal/products/internalProductRouter";

export const internalRouter = new Hono<HonoEnv>();

// Internal/dashboard routes - use betterAuthMiddleware for session auth
internalRouter.use("*", betterAuthMiddleware);
internalRouter.use("*", orgConfigMiddleware);
internalRouter.use("*", apiVersionMiddleware);
internalRouter.use("*", analyticsMiddleware);
internalRouter.use("*", refreshCacheMiddleware);
internalRouter.use("*", queryMiddleware());

internalRouter.use("/admin/*", adminAuthMiddleware);
internalRouter.route("admin", honoAdminRouter);

internalRouter.route("organization", internalOrgRouter);
internalRouter.route("/products", internalProductRouter);
internalRouter.route("/customers", internalCusRouter);
internalRouter.route("/dev", internalDevRouter);
internalRouter.route("/consents", consentRouter);
