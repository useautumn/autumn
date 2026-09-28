import { Hono } from "hono";
import {
	clearBranchCache,
	listBranches,
} from "../../internal/catalog/actions/listBranches.ts";
import { listCatalog } from "../../internal/catalog/actions/listCatalog.ts";
import { warmBranch } from "../../internal/catalog/actions/warmBranch.ts";
import type { TwdHono } from "../types/twdHono.ts";

export const catalogRoutes = new Hono<TwdHono>()
	.post("/branches/refresh", async (c) => {
		clearBranchCache();
		return c.json(await listBranches({ ctx: c.get("ctx") }));
	})
	.get("/catalog", async (c) =>
		c.json(
			await listCatalog({
				ctx: c.get("ctx"),
				branch: c.req.query("branch") || undefined,
				sha: c.req.query("sha") || undefined,
			}),
		),
	)
	.get("/branches", async (c) =>
		c.json(await listBranches({ ctx: c.get("ctx") })),
	)
	// `{.+}` so unencoded slash branches (feat/x) route too.
	.post("/branches/:branch{.+}/warm", async (c) =>
		c.json(
			await warmBranch({
				ctx: c.get("ctx"),
				branch: decodeURIComponent(c.req.param("branch")),
			}),
			202,
		),
	);
