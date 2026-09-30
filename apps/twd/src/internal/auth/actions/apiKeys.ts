import type { z } from "zod";
import type { ApiKey, CreateApiKeyResponse } from "../../../api/contract.ts";
import { TwdError } from "../../../http/apiError.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import {
	getApiKeyWithOwner,
	insertApiKey,
	listApiKeysWithOwner,
	revokeApiKeyRow,
} from "../repos/apiKeysRepo.ts";
import { requireActor } from "./requireActor.ts";

export const API_KEY_PREFIX = "twd_";

export const hashApiKey = ({ secret }: { secret: string }) =>
	new Bun.CryptoHasher("sha256").update(secret).digest("hex");

const toApiKey = (row: {
	id: string;
	name: string;
	prefix: string;
	ownerEmail: string;
	lastUsedAt: Date | null;
	revokedAt: Date | null;
	createdAt: Date;
}): ApiKey => ({
	id: row.id,
	name: row.name,
	prefix: row.prefix,
	ownerEmail: row.ownerEmail,
	lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
	revokedAt: row.revokedAt?.toISOString() ?? null,
	createdAt: row.createdAt.toISOString(),
});

export const createApiKey = async ({
	ctx,
	name,
}: {
	ctx: TwdContext;
	name: string;
}): Promise<z.infer<typeof CreateApiKeyResponse>> => {
	const actor = requireActor({ ctx });
	const secret = `${API_KEY_PREFIX}${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url")}`;
	const row = await insertApiKey({
		ctx,
		userId: actor.userId,
		name,
		prefix: secret.slice(0, 8),
		keyHash: hashApiKey({ secret }),
	});
	ctx.logger.info("api key created", {
		keyId: row.id,
		userId: actor.userId,
		via: actor.via,
	});
	return { apiKey: toApiKey({ ...row, ownerEmail: actor.email }), secret };
};

export const listApiKeys = async ({
	ctx,
}: {
	ctx: TwdContext;
}): Promise<ApiKey[]> => {
	requireActor({ ctx });
	const rows = await listApiKeysWithOwner({ ctx });
	return rows.map(toApiKey);
};

/** Owners can only revoke their own keys. */
export const revokeApiKey = async ({
	ctx,
	id,
}: {
	ctx: TwdContext;
	id: string;
}): Promise<ApiKey> => {
	const actor = requireActor({ ctx });
	const existing = await getApiKeyWithOwner({ ctx, id });
	if (!existing)
		throw new TwdError({
			status: 404,
			code: "api_key_not_found",
			message: `No API key with id ${id}.`,
			next: "List keys with GET /api-keys and pass one of their ids.",
		});
	if (existing.userId !== actor.userId)
		throw new TwdError({
			status: 403,
			code: "not_key_owner",
			message: `API key ${id} belongs to ${existing.ownerEmail}.`,
			next: "You can only revoke your own keys.",
			escalate: `ask ${existing.ownerEmail} to revoke it.`,
		});
	await revokeApiKeyRow({ ctx, id });
	ctx.logger.info("api key revoked", { keyId: id, via: actor.via });
	const revoked = await getApiKeyWithOwner({ ctx, id });
	return toApiKey(revoked ?? existing);
};
