import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleListPurchases } from "./handlers/handleListPurchases.js";
import { handleListSubscriptions } from "./handlers/handleListSubscriptions.js";

export const listPlansRpcRouter = new Hono<HonoEnv>();
listPlansRpcRouter.post("/subscriptions.list", ...handleListSubscriptions);
listPlansRpcRouter.post("/purchases.list", ...handleListPurchases);
