import { z } from "zod/v4";

export const ATOM_KEYS_PATH = "/atom/keys.check";
export const ATOM_TOKEN_HASH_HEADER = "x-atom-token-hash";

export const AtomKeysRequestSchema = z.object({
	key_hashes: z.array(z.string()),
});

export const AtomKeysResponseSchema = z.object({
	invalid_key_hashes: z.array(z.string()),
});
