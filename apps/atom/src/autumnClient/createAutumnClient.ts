import {
	ATOM_KEYS_PATH,
	ATOM_SUBJECT_READ_PATH,
	AtomKeysResponseSchema,
} from "@autumn/byoc";
import { postToAutumn } from "./postToAutumn.js";
import type { AutumnClient } from "./types/autumnClient.js";

type AutumnClientContext = { autumnApiUrl: string };

const findInvalidKeys = async ({
	ctx,
	tokenHash,
	keyHashes,
}: {
	ctx: AutumnClientContext;
	tokenHash: string;
	keyHashes: string[];
}): Promise<string[]> => {
	const reply = await postToAutumn({
		ctx,
		path: ATOM_KEYS_PATH,
		tokenHash,
		body: { key_hashes: keyHashes },
	});
	return AtomKeysResponseSchema.parse(await reply.json()).invalid_key_hashes;
};

const readSubject = async ({
	ctx,
	tokenHash,
	customerId,
	entityId,
}: {
	ctx: AutumnClientContext;
	tokenHash: string;
	customerId: string;
	entityId: string | null;
}): Promise<string> => {
	const reply = await postToAutumn({
		ctx,
		path: ATOM_SUBJECT_READ_PATH,
		tokenHash,
		body: { customer_id: customerId, entity_id: entityId },
	});
	return reply.text();
};

export const createAutumnClient = ({
	autumnApiUrl,
}: {
	autumnApiUrl: string;
}): AutumnClient => {
	const ctx = { autumnApiUrl };
	return {
		findInvalidKeys: (params) => findInvalidKeys({ ctx, ...params }),
		readSubject: (params) => readSubject({ ctx, ...params }),
	};
};
