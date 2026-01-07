import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleCheck } from "../api/check/handleCheck.js";
import { handleCreateBalance } from "./handlers/handleCreateBalance.js";
import { handleListBalances } from "./handlers/handleListBalances.js";
import { handleTrack } from "./handlers/handleTrack.js";
import { handleUpdateBalance } from "./handlers/handleUpdateBalance.js";
import { handleSetUsage } from "./setUsage/handleSetUsage.js";

// Create a Hono app for products
export const balancesRouter = new Hono<HonoEnv>();

balancesRouter.post("/balances/create", ...handleCreateBalance);
balancesRouter.get("/balances/list", ...handleListBalances);
balancesRouter.post("/balances/update", ...handleUpdateBalance);

// Track
balancesRouter.post("/events", ...handleTrack);
balancesRouter.post("/track", ...handleTrack);

// Check
balancesRouter.post("/entitled", ...handleCheck);
balancesRouter.post("/check", ...handleCheck);

// Legacy
balancesRouter.post("/usage", ...handleSetUsage);
