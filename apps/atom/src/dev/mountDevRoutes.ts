import type { Hono } from "hono";
import type { AtomHttpEnv } from "../http/types/atomHttp.js";
import type { DevContext } from "./devContext.js";
import { receiveDeleteAtom } from "./receiveDeleteAtom.js";
import { receiveGetAtom } from "./receiveGetAtom.js";
import { receivePutAtom } from "./receivePutAtom.js";

/**
 * Routes only a dev stack has: its server adds and removes the Atoms this process stands in for.
 * They take no secret; a dev-mode Atom only ever listens on loopback.
 */
export const mountDevRoutes = ({
	app,
	ctx,
}: {
	app: Hono<AtomHttpEnv>;
	ctx: DevContext;
}): void => {
	app.post("/v1/atoms.put", receivePutAtom({ ctx }));
	app.post("/v1/atoms.get", receiveGetAtom({ ctx }));
	app.post("/v1/atoms.delete", receiveDeleteAtom({ ctx }));
};
