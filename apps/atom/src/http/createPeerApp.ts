import { Hono } from "hono";
import { receiveDeleteAtom } from "../multiTenant/receiveDeleteAtom.js";
import { receiveListAtoms } from "../multiTenant/receiveListAtoms.js";
import { receivePutAtom } from "../multiTenant/receivePutAtom.js";
import { ATOM_DELETE, ATOM_PUT } from "../multiTenant/replicateAtoms.js";
import { PEER_LEAVING_PATH } from "../replicas/handover/leavingContract.js";
import {
	PEER_ATOMS_LIST_PATH,
	PEER_CATALOG_SINCE_PATH,
	PEER_SUBJECTS_DIGEST_PATH,
	PEER_SUBJECTS_FETCH_PATH,
	PEER_SUBJECTS_SINCE_PATH,
} from "../replication/catchUp/fetchSince.js";
import { createAtomErrorHandler } from "./handlers/errorHandler/createAtomErrorHandler.js";
import { receiveCheck } from "./handlers/receiveCheck.js";
import { receiveDeleteSubject } from "./handlers/receiveDeleteSubject.js";
import { receiveFinalize } from "./handlers/receiveFinalize.js";
import { receiveLeaving } from "./handlers/receiveLeaving.js";
import {
	receiveCatalogSince,
	receiveSubjectsDigest,
	receiveSubjectsFetch,
	receiveSubjectsSince,
} from "./handlers/receivePeerReads.js";
import { receiveSetCatalog } from "./handlers/receiveSetCatalog.js";
import { receiveSetSubject } from "./handlers/receiveSetSubject.js";
import { receiveTrack } from "./handlers/receiveTrack.js";
import { admissionMiddleware } from "./middlewares/admissionMiddleware.js";
import { clientAuthMiddleware } from "./middlewares/clientAuthMiddleware.js";
import { peerReadyMiddleware } from "./middlewares/peerReadyMiddleware.js";
import {
	peerFolderMiddleware,
	peerRequestMiddleware,
} from "./middlewares/peerRequestMiddleware.js";
import { requestBodyMiddleware } from "./middlewares/requestBodyMiddleware.js";
import { requestLogMiddleware } from "./middlewares/requestLog/requestLogMiddleware.js";
import type { AtomHttpContext, AtomHttpEnv } from "./types/atomHttp.js";

/**
 * What other replicas reach, on the port the deployment keeps off its public endpoint: the same push and tenant
 * routes, applied as relayed, and what a replica catching up asks for, folder by folder. Every request must carry
 * the deployment's peer signature.
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
	app.use("/v1/balances.check", admissionMiddleware({ ctx }));
	app.use("/v1/track", admissionMiddleware({ ctx }));
	app.use("/v1/balances.finalize", admissionMiddleware({ ctx }));
	app.use(
		requestLogMiddleware({ ctx, handleError }),
		requestBodyMiddleware,
		peerRequestMiddleware({ secret }),
	);
	// A check another replica handed on is answered here, whoever this replica's ring says owns it: one hop at most.
	const ready = peerReadyMiddleware({ ctx });
	app.post(
		"/v1/balances.check",
		ready,
		clientAuthMiddleware({ ctx }),
		receiveCheck,
	);
	app.post("/v1/track", ready, clientAuthMiddleware({ ctx }), receiveTrack);
	app.post(
		"/v1/balances.finalize",
		ready,
		clientAuthMiddleware({ ctx }),
		receiveFinalize,
	);
	app.post(PEER_ATOMS_LIST_PATH, receiveListAtoms({ ctx: ctx.multiTenant }));
	app.post(PEER_LEAVING_PATH, receiveLeaving({ ctx }));
	if (ctx.multiTenant) {
		const tenants = { ...ctx.multiTenant, replication: ctx.replication };
		app.post(ATOM_PUT.path, receivePutAtom({ ctx: tenants }));
		app.post(ATOM_DELETE.path, receiveDeleteAtom({ ctx: tenants }));
	}
	const folder = new Hono<AtomHttpEnv>();
	folder.use(peerFolderMiddleware({ ctx }));
	folder.post("/v1/subjects.set", receiveSetSubject({ ctx }));
	folder.post("/v1/subjects.delete", receiveDeleteSubject({ ctx }));
	folder.post("/v1/catalog.set", receiveSetCatalog({ ctx }));
	folder.post(PEER_SUBJECTS_SINCE_PATH, receiveSubjectsSince({ ctx }));
	folder.post(PEER_SUBJECTS_DIGEST_PATH, receiveSubjectsDigest({ ctx }));
	folder.post(PEER_SUBJECTS_FETCH_PATH, receiveSubjectsFetch({ ctx }));
	folder.post(PEER_CATALOG_SINCE_PATH, receiveCatalogSince({ ctx }));
	app.route("/", folder);
	return app;
}
