import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import {
	DeleteCommand,
	PutCommand,
	UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { ensureLocalTable } from "../../common/ensureLocalTable.js";
import {
	IDEMPOTENCY_TABLE_PARTITION_KEY,
	IDEMPOTENCY_TABLE_TTL_ATTRIBUTE,
} from "../idempotencyKeyTable.js";
import type {
	IdempotencyClaim,
	IdempotencyClaimResult,
	IdempotencyKeysContext,
} from "../types/idempotencyKey.js";

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

const isConditionFailed = (error: unknown): boolean =>
	error instanceof ConditionalCheckFailedException;

/** A fresh claim: nothing there, or something there that has expired (TTL sweeps lazily, days late). */
const putFresh = async ({
	ctx,
	claim,
}: {
	ctx: IdempotencyKeysContext;
	claim: IdempotencyClaim;
}): Promise<void> => {
	const now = nowSeconds();
	await ctx.dynamo.client.send(
		new PutCommand({
			TableName: ctx.tableName,
			Item: {
				pk: claim.storageKey,
				createdAt: now,
				expiresAt: now + Math.floor(claim.ttlMs / 1000),
				...(claim.owner && { owner: claim.owner }),
			},
			ConditionExpression: "attribute_not_exists(pk) OR expiresAt < :now",
			ExpressionAttributeValues: { ":now": now },
		}),
	);
};

/** The same owner again: touches nothing, so the original expiry stands. */
const resumeOwn = async ({
	ctx,
	claim,
}: {
	ctx: IdempotencyKeysContext;
	claim: IdempotencyClaim & { owner: string };
}): Promise<void> => {
	await ctx.dynamo.client.send(
		new UpdateCommand({
			TableName: ctx.tableName,
			Key: { pk: claim.storageKey },
			UpdateExpression: "SET #owner = :owner",
			ConditionExpression: "#owner = :owner AND expiresAt >= :now",
			ExpressionAttributeNames: { "#owner": "owner" },
			ExpressionAttributeValues: {
				":owner": claim.owner,
				":now": nowSeconds(),
			},
		}),
	);
};

export const claimIdempotencyKey = async ({
	ctx,
	claim,
}: {
	ctx: IdempotencyKeysContext;
	claim: IdempotencyClaim;
}): Promise<IdempotencyClaimResult> => {
	try {
		await ensureLocalTable({
			ctx,
			tableName: ctx.tableName,
			partitionKey: IDEMPOTENCY_TABLE_PARTITION_KEY,
			ttlAttribute: IDEMPOTENCY_TABLE_TTL_ATTRIBUTE,
		});
		await putFresh({ ctx, claim });
		return "claimed";
	} catch (error) {
		if (!isConditionFailed(error)) return unavailable({ ctx, error });
	}
	if (claim.owner === undefined) return "duplicate";
	try {
		await resumeOwn({ ctx, claim: { ...claim, owner: claim.owner } });
		return "resumed";
	} catch (error) {
		if (isConditionFailed(error)) return "duplicate";
		return unavailable({ ctx, error });
	}
};

/** Frees the key so the client can retry; with an owner, only that owner's claim goes. Never throws. */
export const releaseIdempotencyKey = async ({
	ctx,
	storageKey,
	owner,
}: {
	ctx: IdempotencyKeysContext;
	storageKey: string;
	owner?: string;
}): Promise<void> => {
	try {
		await ctx.dynamo.client.send(
			new DeleteCommand({
				TableName: ctx.tableName,
				Key: { pk: storageKey },
				...(owner && {
					ConditionExpression: "#owner = :owner",
					ExpressionAttributeNames: { "#owner": "owner" },
					ExpressionAttributeValues: { ":owner": owner },
				}),
			}),
		);
	} catch {
		// A failed release only costs the caller a retry window, never the request.
	}
};

const unavailable = ({
	ctx,
	error,
}: {
	ctx: IdempotencyKeysContext;
	error: unknown;
}): "unavailable" => {
	ctx.logger?.warn(
		`[idempotencyKeys] dynamo unavailable, failing open: ${error instanceof Error ? error.message : String(error)}`,
	);
	return "unavailable";
};
