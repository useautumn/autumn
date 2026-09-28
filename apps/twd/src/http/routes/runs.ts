import { Hono } from "hono";
import type { TwdHono } from "../types/twdHono.ts";

export const runsRoutes = new Hono<TwdHono>();
