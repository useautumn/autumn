import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleDeleteAccount } from "./handleDeleteAccount.js";

export const accountRouter = new Hono<HonoEnv>();

accountRouter.delete("", ...handleDeleteAccount);
