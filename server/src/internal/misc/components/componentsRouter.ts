import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleGetPricingTable } from "./handlers/handleGetPricingTable.js";

export const componentsRouter = new Hono<HonoEnv>();

componentsRouter.get("/pricing_table", ...handleGetPricingTable);
