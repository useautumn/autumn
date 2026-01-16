import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleDeleteView } from "./handlers/handleDeleteView.js";
import { handleGetViews } from "./handlers/handleGetViews.js";
import { handleSaveView } from "./handlers/handleSaveView.js";

export const savedViewsRouter = new Hono<HonoEnv>();

savedViewsRouter.post("/save", ...handleSaveView);
savedViewsRouter.get("", ...handleGetViews);
savedViewsRouter.delete("/:viewId", ...handleDeleteView);
