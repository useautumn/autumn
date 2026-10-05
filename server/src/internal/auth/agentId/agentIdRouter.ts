import { getAutumnEnv } from "@autumn/env";
import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { auth } from "@/utils/auth.js";
import { startAgentIdSignIn } from "./startAgentIdSignIn.js";

export const agentIdRouter = new Hono<HonoEnv>();

agentIdRouter.get("/login", (c) =>
	startAgentIdSignIn({
		request: c.req.raw,
		authHandler: auth.handler,
		apiUrl: getAutumnEnv().AUTUMN_API_URL,
		clientUrl:
			process.env.CLIENT_URL?.replace(/\/$/, "") ?? "http://localhost:3000",
	}),
);
