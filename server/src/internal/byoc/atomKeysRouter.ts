import { ATOM_TOKEN_HASH_HEADER, AtomKeysRequestSchema } from "@autumn/byoc";
import { type Context, Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { findInvalidAtomKeys } from "./actions/keys/findInvalidAtomKeys.js";

/** An org's Atom asks which secret keys it learned to drop, proving itself by its token hash rather than a key or session. */
async function handleCheckAtomKeys(c: Context<HonoEnv>) {
	const tokenHash = c.req.header(ATOM_TOKEN_HASH_HEADER);
	const parsed = AtomKeysRequestSchema.safeParse(
		await c.req.json().catch(() => null),
	);
	if (!parsed.success) return c.json({ message: "Invalid request" }, 400);
	const invalid = tokenHash
		? await findInvalidAtomKeys({
				db: c.get("ctx").db,
				tokenHash,
				keyHashes: parsed.data.key_hashes,
			})
		: null;
	if (!invalid) return c.json({ message: "Unknown Atom" }, 401);
	return c.json({ invalid_key_hashes: invalid });
}

export const atomKeysRouter = new Hono<HonoEnv>();
atomKeysRouter.post("/", handleCheckAtomKeys);
