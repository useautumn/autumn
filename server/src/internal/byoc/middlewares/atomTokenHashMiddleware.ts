import { ATOM_TOKEN_HASH_HEADER, AtomSubjectReadErrorCode } from "@autumn/byoc";
import type { MiddlewareHandler } from "hono";
import { getOrgWithFeaturesCached } from "@/internal/orgs/orgUtils/getOrgWithFeaturesCached.js";
import { cacheDeploymentRepo } from "../repos/cacheDeploymentRepo.js";
import type { AtomHonoEnv } from "../types/atomHonoEnv.js";

/** An org's Atom proves itself by its token hash rather than a key or session; its org, features and env come from that alone. */
export const atomTokenHashMiddleware: MiddlewareHandler<AtomHonoEnv> = async (
	c,
	next,
) => {
	const tokenHash = c.req.header(ATOM_TOKEN_HASH_HEADER);
	const atom = tokenHash
		? await cacheDeploymentRepo.findByTokenHash({
				db: c.get("ctx").db,
				tokenHash,
			})
		: null;
	const orgWithFeatures = atom
		? await getOrgWithFeaturesCached({
				db: c.get("ctx").db,
				orgId: atom.orgId,
				env: atom.env,
			})
		: null;
	if (!atom || !orgWithFeatures)
		return c.json(
			{ code: AtomSubjectReadErrorCode.AtomUnknown, message: "Unknown Atom" },
			401,
		);
	c.set("atom", atom);
	c.set("ctx", { ...c.get("ctx"), ...orgWithFeatures, env: atom.env });
	await next();
};
