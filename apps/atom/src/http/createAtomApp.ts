import { Hono } from "hono";
import { mountMultiTenantRoutes } from "../multiTenant/mountMultiTenantRoutes.js";
import { PEER_SUBJECTS_SINCE_PATH } from "../peers/peerSync.js";
import { createAtomErrorHandler } from "./handlers/errorHandler/createAtomErrorHandler.js";
import { receiveCheck } from "./handlers/receiveCheck.js";
import { receiveHealth } from "./handlers/receiveHealth.js";
import { receiveSetCatalog } from "./handlers/receiveSetCatalog.js";
import { receiveSetSubject } from "./handlers/receiveSetSubject.js";
import { receiveSubjectsSince } from "./handlers/receiveSubjectsSince.js";
import { atomTokenMiddleware } from "./middlewares/atomTokenMiddleware.js";
import { clientAuthMiddleware } from "./middlewares/clientAuthMiddleware.js";
import { peerPushMiddleware } from "./middlewares/peerPushMiddleware.js";
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

	// The customer's app checks with its secret key on an org's own Atom; Autumn's pushes carry the Atom token,
	// and a push another replica passes on carries its signature instead.
	const tokenAuth = atomTokenMiddleware({ ctx });
	const pushAuth = ctx.peerTokenHash
		? peerPushMiddleware({
				ctx,
				tokenHash: ctx.peerTokenHash,
				orElse: tokenAuth,
			})
		: tokenAuth;
	const authorized = new Hono<AtomHttpEnv>();
	authorized.post(
		"/balances.check",
		clientAuthMiddleware({ ctx }),
		receiveCheck,
	);
	authorized.post("/subjects.set", pushAuth, receiveSetSubject({ ctx }));
	authorized.post("/catalog.set", pushAuth, receiveSetCatalog({ ctx }));
	// Only a peer asks this; a request without its signature is refused like a push without the token.
	if (ctx.peerTokenHash)
		app.post(PEER_SUBJECTS_SINCE_PATH, pushAuth, receiveSubjectsSince);
	app.route("/v1", authorized);
	return app;
}
