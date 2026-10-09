import { z } from "zod/v4";

/** Where an org's Atom asks Autumn which secret keys it holds are no longer the org's own. */
export const ATOM_KEYS_PATH = "/atom/keys.check";
/** An Atom is deployed with its token's hash, never the token, so the hash is what it proves itself with. */
export const ATOM_TOKEN_HASH_HEADER = "x-atom-token-hash";

/** Hashes are SHA-256 hex of the secret key, as `api_keys.hashed_key` stores them. */
export const AtomKeysRequestSchema = z.object({
	key_hashes: z.array(z.string()),
});

export const AtomKeysResponseSchema = z.object({
	invalid_key_hashes: z.array(z.string()),
});
