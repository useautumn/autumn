import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv";
import { handleFlash } from "./handlers/handleFlash";

export const dfuRpcRouter = new Hono<HonoEnv>();
dfuRpcRouter.post("/dfu.flash", ...handleFlash);
