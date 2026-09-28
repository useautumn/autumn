import { Hono } from "hono";
import type { TwdHono } from "../types/twdHono.ts";

export const mcpRoutes = new Hono<TwdHono>();
