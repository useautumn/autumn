import { resolve } from "node:path";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import type { TwdHono } from "../types/twdHono.ts";

/** Built by `bun run web:build`; absent in API-only dev, where Vite serves the dashboard. */
const DIST = resolve(import.meta.dir, "../../../web/dist");
const INDEX = resolve(DIST, "index.html");

export const dashboardRoutes = new Hono<TwdHono>()
	.use("/*", serveStatic({ root: DIST }))
	.get("*", async (c) => {
		const index = Bun.file(INDEX);
		if (!(await index.exists())) return c.notFound();
		return c.html(await index.text());
	});
