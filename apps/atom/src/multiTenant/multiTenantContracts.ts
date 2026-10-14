import { z } from "zod/v4";
import { ATOM_ID, type TenantAtom } from "./atomFolders.js";

const atomIdSchema = z.string().regex(ATOM_ID);

const putAtomBodySchema = z.object({
	id: atomIdSchema,
	token_hash: z.string().regex(/^[0-9a-f]{64}$/),
});

const atomIdBodySchema = z.object({ id: atomIdSchema });

export const putAtomBodyToTenantAtom = ({
	body,
}: {
	body: unknown;
}): TenantAtom => {
	const parsed = putAtomBodySchema.parse(body);
	return { id: parsed.id, tokenHash: parsed.token_hash };
};

export const atomIdBodyToId = ({ body }: { body: unknown }): string =>
	atomIdBodySchema.parse(body).id;
