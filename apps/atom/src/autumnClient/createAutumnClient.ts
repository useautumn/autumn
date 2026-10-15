import {
	ATOM_KEYS_PATH,
	ATOM_SUBJECT_READ_PATH,
	ATOM_TRACKS_APPEND_PATH,
	AtomKeysResponseSchema,
	type AtomTracksAppendRequest,
} from "@autumn/byoc";
import { setLogOrg } from "../lib/logging/getAtomLogger.js";
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
	const { invalid_key_hashes, org } = AtomKeysResponseSchema.parse(
		await reply.json(),
	);
	if (org) setLogOrg({ org_id: org.id, org_slug: org.slug });
	return invalid_key_hashes;
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

const appendTracks = async ({
	ctx,
	tokenHash,
	...request
}: {
	ctx: AutumnClientContext;
	tokenHash: string;
} & AtomTracksAppendRequest): Promise<void> => {
	await postToAutumn({
		ctx,
		path: ATOM_TRACKS_APPEND_PATH,
		tokenHash,
		body: request,
	});
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
		appendTracks: (params) => appendTracks({ ctx, ...params }),
	};
};
