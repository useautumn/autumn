import { Hono } from "hono";
import type { TwdHono } from "../types/twdHono.ts";

export const webhooksRoutes = new Hono<TwdHono>();
