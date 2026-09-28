import { Hono } from "hono";
import type { TwdHono } from "../types/twdHono.ts";

export const ingressRoutes = new Hono<TwdHono>();
