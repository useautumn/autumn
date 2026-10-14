import { Hono } from "hono";
import { mountMultiTenantRoutes } from "../multiTenant/mountMultiTenantRoutes.js";
import { createAtomErrorHandler } from "./handlers/errorHandler/createAtomErrorHandler.js";
import { receiveCheck } from "./handlers/receiveCheck.js";
import { receiveDeleteSubject } from "./handlers/receiveDeleteSubject.js";
import { receiveFinalize } from "./handlers/receiveFinalize.js";
import { receiveHealth } from "./handlers/receiveHealth.js";
import { receiveSetCatalog } from "./handlers/receiveSetCatalog.js";
import { receiveSetSubject } from "./handlers/receiveSetSubject.js";
import { receiveTrack } from "./handlers/receiveTrack.js";
import { admissionMiddleware } from "./middlewares/admissionMiddleware.js";
import { atomTokenMiddleware } from "./middlewares/atomTokenMiddleware.js";
import { checkHopMiddleware } from "./middlewares/checkHopMiddleware.js";
import { clientAuthMiddleware } from "./middlewares/clientAuthMiddleware.js";
import { requestBodyMiddleware } from "./middlewares/requestBodyMiddleware.js";
import { requestLogMiddleware } from "./middlewares/requestLog/requestLogMiddleware.js";
import type { AtomHttpContext, AtomHttpEnv } from "./types/atomHttp.js";

/** What the public endpoint serves. Nothing here trusts another replica: peers talk on their own port (createPeerApp). */
export function createAtomApp({ ctx }: { ctx: AtomHttpContext }) {
	const app = new Hono<AtomHttpEnv>();
	const handleError = createAtomErrorHandler({ ctx });
	app.onError(handleError);
	// Before the request line: under load, a line per refused check would cost what refusing saves.
	app.use("/v1/balances.check", admissionMiddleware({ ctx }));
	app.use("/v1/track", admissionMiddleware({ ctx }));
	// A finalize the API cannot settle before its lock's hand-in lands: its caller retries the Atom instead.
	app.use(
		"/v1/balances.finalize",
		admissionMiddleware({ ctx, retriedAtAtom: true }),
	);
	app.use(requestLogMiddleware({ ctx, handleError }), requestBodyMiddleware);
	app.get("/health", receiveHealth({ ctx }));
	if (ctx.multiTenant)
		mountMultiTenantRoutes({
			app,
			ctx: { ...ctx.multiTenant, replication: ctx.replication },
		});

	// The customer's app checks with its secret key on an org's own Atom; Autumn's pushes carry the Atom token.
	const pushAuth = atomTokenMiddleware({ ctx });
	const authorized = new Hono<AtomHttpEnv>();
	authorized.post(
		"/balances.check",
		checkHopMiddleware({ ctx }),
		clientAuthMiddleware({ ctx }),
		receiveCheck,
	);
	authorized.post(
		"/track",
		checkHopMiddleware({ ctx }),
		clientAuthMiddleware({ ctx }),
		receiveTrack,
	);
	authorized.post(
		"/balances.finalize",
		checkHopMiddleware({ ctx }),
		clientAuthMiddleware({ ctx }),
		receiveFinalize,
	);
	authorized.post("/subjects.set", pushAuth, receiveSetSubject({ ctx }));
	authorized.post("/subjects.delete", pushAuth, receiveDeleteSubject({ ctx }));
	authorized.post("/catalog.set", pushAuth, receiveSetCatalog({ ctx }));
	app.route("/v1", authorized);
	return app;
}
