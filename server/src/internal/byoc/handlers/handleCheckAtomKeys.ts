import { AtomKeysRequestSchema } from "@autumn/byoc";
import type { Context } from "hono";
import { findInvalidAtomKeys } from "../actions/keys/findInvalidAtomKeys.js";
import type { AtomHonoEnv } from "../types/atomHonoEnv.js";

/** An org's Atom asks which secret keys it learned to drop. */
export async function handleCheckAtomKeys(c: Context<AtomHonoEnv>) {
	const parsed = AtomKeysRequestSchema.safeParse(
		await c.req.json().catch(() => null),
	);
	if (!parsed.success) return c.json({ message: "Invalid request" }, 400);
	const { orgId, env } = c.get("atom");
	const invalid = await findInvalidAtomKeys({
		db: c.get("ctx").db,
		orgId,
		env,
		keyHashes: parsed.data.key_hashes,
	});
	return c.json({ invalid_key_hashes: invalid });
}
