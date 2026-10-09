import { Hono } from "hono";
import { mountMultiTenantRoutes } from "../multiTenant/mountMultiTenantRoutes.js";
import { createAtomErrorHandler } from "./handlers/errorHandler/createAtomErrorHandler.js";
import { receiveCheck } from "./handlers/receiveCheck.js";
import { receiveHealth } from "./handlers/receiveHealth.js";
import { receiveSetCatalog } from "./handlers/receiveSetCatalog.js";
import { receiveSetSubject } from "./handlers/receiveSetSubject.js";
import { atomTokenMiddleware } from "./middlewares/atomTokenMiddleware.js";
import { clientAuthMiddleware } from "./middlewares/clientAuthMiddleware.js";
import { requestBodyMiddleware } from "./middlewares/requestBodyMiddleware.js";
import { requestLogMiddleware } from "./middlewares/requestLog/requestLogMiddleware.js";
import type { AtomHttpContext, AtomHttpEnv } from "./types/atomHttp.js";

export function createAtomApp({ ctx }: { ctx: AtomHttpContext }) {
	const app = new Hono<AtomHttpEnv>();
	const handleError = createAtomErrorHandler({ ctx });
	app.onError(handleError);
	app.use(requestLogMiddleware({ ctx, handleError }), requestBodyMiddleware);
	app.get("/health", receiveHealth({ ctx }));
	if (ctx.multiTenant) mountMultiTenantRoutes({ app, ctx: ctx.multiTenant });

	// The customer's app checks with its secret key on an org's own Atom; Autumn's pushes carry the Atom token.
	const pushAuth = atomTokenMiddleware({ ctx });
	const authorized = new Hono<AtomHttpEnv>();
	authorized.post(
		"/balances.check",
		clientAuthMiddleware({ ctx }),
		receiveCheck,
	);
	authorized.post("/subjects.set", pushAuth, receiveSetSubject);
	authorized.post("/catalog.set", pushAuth, receiveSetCatalog);
	app.route("/v1", authorized);
	return app;
}
