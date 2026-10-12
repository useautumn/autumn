import { Hono } from "hono";
import {
	PEER_CATALOG_SINCE_PATH,
	PEER_SUBJECTS_DIGEST_PATH,
	PEER_SUBJECTS_FETCH_PATH,
	PEER_SUBJECTS_SINCE_PATH,
} from "../replication/catchUp/fetchSince.js";
import { createAtomErrorHandler } from "./handlers/errorHandler/createAtomErrorHandler.js";
import { receiveSetCatalog } from "./handlers/receiveSetCatalog.js";
import { receiveSetSubject } from "./handlers/receiveSetSubject.js";
import {
	receiveCatalogSince,
	receiveSubjectsDigest,
	receiveSubjectsFetch,
	receiveSubjectsSince,
} from "./handlers/receiveSubjectsSince.js";
import { peerRequestMiddleware } from "./middlewares/peerRequestMiddleware.js";
import { requestBodyMiddleware } from "./middlewares/requestBodyMiddleware.js";
import { requestLogMiddleware } from "./middlewares/requestLog/requestLogMiddleware.js";
import type { AtomHttpContext, AtomHttpEnv } from "./types/atomHttp.js";

/**
 * What other replicas reach, on the port the deployment keeps off its public endpoint: the same push routes, applied
 * as relayed, and what a replica catching up asks for. Every request must carry the deployment's peer signature.
 */
export function createPeerApp({
	ctx,
	secret,
}: {
	ctx: AtomHttpContext;
	secret: string;
}) {
	const app = new Hono<AtomHttpEnv>();
	const handleError = createAtomErrorHandler({ ctx });
	app.onError(handleError);
	app.use(
		requestLogMiddleware({ ctx, handleError }),
		requestBodyMiddleware,
		peerRequestMiddleware({ ctx, secret }),
	);
	app.post("/v1/subjects.set", receiveSetSubject({ ctx }));
	app.post("/v1/catalog.set", receiveSetCatalog({ ctx }));
	app.post(PEER_SUBJECTS_SINCE_PATH, receiveSubjectsSince({ ctx }));
	app.post(PEER_SUBJECTS_DIGEST_PATH, receiveSubjectsDigest({ ctx }));
	app.post(PEER_SUBJECTS_FETCH_PATH, receiveSubjectsFetch({ ctx }));
	app.post(PEER_CATALOG_SINCE_PATH, receiveCatalogSince({ ctx }));
	return app;
}
