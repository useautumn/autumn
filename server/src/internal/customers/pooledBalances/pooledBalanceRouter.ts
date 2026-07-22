import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleListPooledBalanceContributions } from "./handlers/handleListPooledBalanceContributions.js";

export const pooledBalanceRpcRouter = new Hono<HonoEnv>();

pooledBalanceRpcRouter.post(
	"/pooled_balances.list_contributions",
	...handleListPooledBalanceContributions,
);
