import { z } from "zod/v4";
import { DEV_ATOM_ID, type DevAtom } from "./atomFolders.js";

const atomIdSchema = z.string().regex(DEV_ATOM_ID);

/** `POST /v1/atoms.put` as a dev stack's server sends it. */
const putAtomBodySchema = z.object({
	id: atomIdSchema,
	token_hash: z.string().regex(/^[0-9a-f]{64}$/),
});

/** `POST /v1/atoms.get` and `POST /v1/atoms.delete`. */
const atomIdBodySchema = z.object({ id: atomIdSchema });

export const putAtomBodyToDevAtom = ({ body }: { body: unknown }): DevAtom => {
	const parsed = putAtomBodySchema.parse(body);
	return { id: parsed.id, tokenHash: parsed.token_hash };
};

export const atomIdBodyToId = ({ body }: { body: unknown }): string =>
	atomIdBodySchema.parse(body).id;
