import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleUpdateBalance } from "./handlers/handleUpdateBalance.js";

// Create a Hono app for products
export const balancesRouter = new Hono<HonoEnv>();

balancesRouter.post("/balances/update", ...handleUpdateBalance);
