import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleNukeOrganisationConfiguration } from "./handlers/handleNukeOrganisationConfiguration";
import { handlePushOrganisationConfiguration } from "./handlers/handlePushOrganisationConfiguration";

export const configsRouter = new Hono<HonoEnv>();

configsRouter.post("/push", ...handlePushOrganisationConfiguration);
configsRouter.delete("/nuke", ...handleNukeOrganisationConfiguration);
