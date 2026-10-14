import { ATOM_TOKEN_HASH_HEADER, AtomSubjectReadErrorCode } from "@autumn/byoc";
import type { MiddlewareHandler } from "hono";
import { findShadowAtomByTokenHash } from "@/internal/misc/shadowAtom/actions/findShadowAtomByTokenHash.js";
import { isShadowAtomCutOff } from "@/internal/misc/shadowAtom/shadowAtomCutOffStore.js";
import { cacheDeploymentRepo } from "../repos/cacheDeploymentRepo.js";
import type { AtomHonoEnv } from "../types/atomHonoEnv.js";

/** An org's Atom proves itself by its token hash rather than a key or session; its org and env come from that alone. */
export const atomTokenHashMiddleware: MiddlewareHandler<AtomHonoEnv> = async (
	c,
	next,
) => {
	const tokenHash = c.req.header(ATOM_TOKEN_HASH_HEADER);
	const orgAtom = tokenHash
		? await cacheDeploymentRepo.findByTokenHash({
				db: c.get("ctx").db,
				tokenHash,
			})
		: null;
	const shadowAtom =
		tokenHash && !orgAtom ? findShadowAtomByTokenHash({ tokenHash }) : null;
	if (shadowAtom && isShadowAtomCutOff())
		return c.json(
			{
				code: "atom_shadow_cut_off",
				message: "Autumn is cut off from the shadow Atom",
			},
			503,
		);
	const atom = orgAtom ?? shadowAtom;
	if (!atom)
		return c.json(
			{ code: AtomSubjectReadErrorCode.AtomUnknown, message: "Unknown Atom" },
			401,
		);
	c.set("atom", atom);
	await next();
};
