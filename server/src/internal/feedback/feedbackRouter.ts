import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleSubmitFeedback } from "./handleSubmitFeedback.js";

export const feedbackRouter = new Hono<HonoEnv>();

feedbackRouter.post("", ...handleSubmitFeedback);
