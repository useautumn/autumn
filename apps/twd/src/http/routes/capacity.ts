import { Hono } from "hono";
import { getCapacity } from "../../internal/capacity/actions/getCapacity.ts";
import type { TwdHono } from "../types/twdHono.ts";

export const capacityRoutes = new Hono<TwdHono>().get("/capacity", async (c) =>
	c.json(await getCapacity({ ctx: c.get("ctx") })),
);
