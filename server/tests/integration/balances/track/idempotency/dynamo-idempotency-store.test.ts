/**
 * Exercises the DynamoDB idempotency store against the local emulator
 * (dynamodb-local in `bun dw` / `bun dev:services`, dynoxide in `bun tw`).
 *
 * Contract under test:
 *   - First claim of a key succeeds ("claimed"), second rejects ("duplicate").
 *   - Release makes the key claimable again.
 *   - An expired-but-undeleted item (TTL sweepers lag, even on real AWS) is
 *     claimable — expiry is enforced in the claim's ConditionExpression.
 *   - The table is auto-created on first use against a local endpoint.
 */

import { describe, expect, test } from "bun:test";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { getIdempotencyTableName } from "@/external/aws/dynamodb/idempotencyKeys/idempotencyKeyTable.js";
import { claimDynamoIdempotencyKey } from "@/external/aws/dynamodb/idempotencyKeys/operations/claimDynamoIdempotencyKey.js";
import { releaseDynamoIdempotencyKey } from "@/external/aws/dynamodb/idempotencyKeys/operations/releaseDynamoIdempotencyKey.js";
import { getDynamoDocumentClient } from "@/external/aws/dynamodb/initDynamoDb.js";

const hasLocalDynamo = Boolean(process.env.DYNAMODB_ENDPOINT);

const uniqueStorageKey = () =>
	`org_test:sandbox:idempotency:${crypto.randomUUID()}`;

describe.if(hasLocalDynamo)("dynamoIdempotencyStore", () => {
	test("claims a fresh key, rejects the second claim", async () => {
		const storageKey = uniqueStorageKey();

		expect(await claimDynamoIdempotencyKey({ storageKey })).toBe("claimed");
		expect(await claimDynamoIdempotencyKey({ storageKey })).toBe("duplicate");
	});

	test("a released key is claimable again", async () => {
		const storageKey = uniqueStorageKey();

		expect(await claimDynamoIdempotencyKey({ storageKey })).toBe("claimed");
		await releaseDynamoIdempotencyKey({ storageKey });
		expect(await claimDynamoIdempotencyKey({ storageKey })).toBe("claimed");
	});

	test("an expired-but-undeleted item is claimable", async () => {
		const storageKey = uniqueStorageKey();
		const expiredSeconds = Math.floor(Date.now() / 1000) - 60;

		await getDynamoDocumentClient().send(
			new PutCommand({
				TableName: getIdempotencyTableName(),
				Item: {
					pk: storageKey,
					createdAt: expiredSeconds,
					expiresAt: expiredSeconds,
				},
			}),
		);

		expect(await claimDynamoIdempotencyKey({ storageKey })).toBe("claimed");
	});

	test("releasing a key that was never claimed is a no-op", async () => {
		await expect(
			releaseDynamoIdempotencyKey({ storageKey: uniqueStorageKey() }),
		).resolves.toBeUndefined();
	});
});

describe.if(!hasLocalDynamo)("dynamoIdempotencyStore (no emulator)", () => {
	test("skipped — DYNAMODB_ENDPOINT is not set", () => {
		expect(hasLocalDynamo).toBe(false);
	});
});
