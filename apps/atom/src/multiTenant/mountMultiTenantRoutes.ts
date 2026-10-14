import type { Hono } from "hono";
import type { AtomHttpContext, AtomHttpEnv } from "../http/types/atomHttp.js";
import { adminTokenMiddleware } from "./adminTokenMiddleware.js";
import type { MultiTenantContext } from "./multiTenantContext.js";
import { receiveDeleteAtom } from "./receiveDeleteAtom.js";
import { receiveGetAtom } from "./receiveGetAtom.js";
import { receivePutAtom } from "./receivePutAtom.js";

export const mountMultiTenantRoutes = ({
	app,
	ctx,
}: {
	app: Hono<AtomHttpEnv>;
	ctx: MultiTenantContext & Pick<AtomHttpContext, "replication">;
}): void => {
	const adminOnly = adminTokenMiddleware({ ctx });
	app.post("/v1/atoms.put", adminOnly, receivePutAtom({ ctx }));
	app.post("/v1/atoms.get", adminOnly, receiveGetAtom({ ctx }));
	app.post("/v1/atoms.delete", adminOnly, receiveDeleteAtom({ ctx }));
};
