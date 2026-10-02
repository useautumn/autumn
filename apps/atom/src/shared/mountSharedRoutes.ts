import type { Hono } from "hono";
import type { AtomHttpEnv } from "../http/types/atomHttp.js";
import { adminTokenMiddleware } from "./adminTokenMiddleware.js";
import { receiveDeleteAtom } from "./receiveDeleteAtom.js";
import { receiveGetAtom } from "./receiveGetAtom.js";
import { receivePutAtom } from "./receivePutAtom.js";
import type { SharedContext } from "./sharedContext.js";

/** Routes only a shared Atom has: the admin adds and removes the orgs it holds. */
export const mountSharedRoutes = ({
	app,
	ctx,
}: {
	app: Hono<AtomHttpEnv>;
	ctx: SharedContext;
}): void => {
	// Per route, not on a sub-app: mounted at /v1, a sub-app's middleware would also guard the org routes.
	const adminOnly = adminTokenMiddleware({ ctx });
	app.post("/v1/atoms.put", adminOnly, receivePutAtom({ ctx }));
	app.post("/v1/atoms.get", adminOnly, receiveGetAtom({ ctx }));
	app.post("/v1/atoms.delete", adminOnly, receiveDeleteAtom({ ctx }));
};
