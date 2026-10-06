import { Hono } from "hono";
import { adminTokenMiddleware } from "../multiTenant/adminTokenMiddleware.js";
import { mountMultiTenantRoutes } from "../multiTenant/mountMultiTenantRoutes.js";
import { createAtomErrorHandler } from "./handlers/errorHandler/createAtomErrorHandler.js";
import { receiveCheck } from "./handlers/receiveCheck.js";
import {
	receiveBench,
	receiveFloor,
	receiveProfile,
} from "./handlers/receiveDiagnostics.js";
import { receiveHealth } from "./handlers/receiveHealth.js";
import { receiveSetCatalog } from "./handlers/receiveSetCatalog.js";
import { receiveSetSubject } from "./handlers/receiveSetSubject.js";
import { atomTokenMiddleware } from "./middlewares/atomTokenMiddleware.js";
import { rebalanceConnectionsMiddleware } from "./middlewares/rebalanceConnectionsMiddleware.js";
import { requestBodyMiddleware } from "./middlewares/requestBodyMiddleware.js";
import { requestLogMiddleware } from "./middlewares/requestLog/requestLogMiddleware.js";
import type { AtomHttpContext, AtomHttpEnv } from "./types/atomHttp.js";

export function createAtomApp({ ctx }: { ctx: AtomHttpContext }) {
	const app = new Hono<AtomHttpEnv>();
	const handleError = createAtomErrorHandler({ ctx });
	app.onError(handleError);
	app.use(
		rebalanceConnectionsMiddleware(),
		requestLogMiddleware({ ctx, handleError }),
		requestBodyMiddleware,
	);
	app.get("/health", receiveHealth({ ctx }));
	// Diagnostics read the Atom's own data and CPU: the deployment's token opens them, or a multi-tenant Atom's admin token.
	const diagnosticsOnly = ctx.multiTenant
		? adminTokenMiddleware({ ctx: ctx.multiTenant })
		: atomTokenMiddleware({ ctx });
	app.get("/health/profile", diagnosticsOnly, receiveProfile);
	app.post("/health/floor", diagnosticsOnly, receiveFloor);
	if (ctx.dataDir)
		app.get(
			"/health/bench",
			diagnosticsOnly,
			receiveBench({ dataDir: ctx.dataDir }),
		);
	if (ctx.multiTenant) mountMultiTenantRoutes({ app, ctx: ctx.multiTenant });

	// Everything else needs the Atom token: the customer's app asks, Autumn keeps the subjects current.
	const authorized = new Hono<AtomHttpEnv>();
	authorized.use(atomTokenMiddleware({ ctx }));
	authorized.post("/balances.check", receiveCheck);
	authorized.post("/subjects.set", receiveSetSubject);
	authorized.post("/catalog.set", receiveSetCatalog);
	app.route("/v1", authorized);
	return app;
}
