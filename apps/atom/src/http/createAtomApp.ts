import { Hono } from "hono";
import { mountDevRoutes } from "../dev/mountDevRoutes.js";
import { atomErrorHandler } from "./handlers/atomErrorHandler.js";
import { receiveCheck } from "./handlers/receiveCheck.js";
import { receiveHealth } from "./handlers/receiveHealth.js";
import { receiveSetSubject } from "./handlers/receiveSetSubject.js";
import { atomTokenMiddleware } from "./middlewares/atomTokenMiddleware.js";
import type { AtomHttpContext, AtomHttpEnv } from "./types/atomHttp.js";

export function createAtomApp({ ctx }: { ctx: AtomHttpContext }) {
	const app = new Hono();
	app.onError(atomErrorHandler({ ctx }));
	app.get("/health", receiveHealth);
	if (ctx.dev) mountDevRoutes({ app, ctx: ctx.dev });

	// Everything else needs the Atom token: the customer's app asks, Autumn keeps the subjects current.
	const authorized = new Hono<AtomHttpEnv>();
	authorized.use(atomTokenMiddleware({ ctx }));
	authorized.post("/balances.check", receiveCheck);
	authorized.post("/subjects.set", receiveSetSubject);
	app.route("/v1", authorized);
	return app;
}
