/**
 * Org-configurable idempotency TTLs, verified against real stores.
 *
 * Contract under test:
 *   - A balances claim for an org with idempotency_config uses the configured
 *     TTL: the Dynamo item's expiresAt lands at ~now + configured hours.
 *   - An org without config falls back to the 24h default.
 *
 * Claims run in-process through withIdempotencyKey (the same wrapper the
 * middleware and track use), with the config injected on a ctx clone — the
 * org row is the single source (no cache layer to poison).
 */

import { describe, expect, test } from "bun:test";
import {
	DEFAULT_IDEMPOTENCY_TTL_HOURS,
	type IdempotencyConfig,
	ms,
	RouteGroup,
} from "@autumn/shared";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { getIdempotencyTableName } from "@/external/aws/dynamodb/idempotencyKeys/idempotencyKeyTable.js";
import { getDynamoDocumentClient } from "@/external/aws/dynamodb/initDynamoDb.js";
import { buildIdempotencyStorageKey } from "@/internal/misc/idempotency/idempotencyKeyUtils.js";
import { withIdempotencyKey } from "@/internal/misc/idempotency/withIdempotencyKey.js";

const TOLERANCE_MS = ms.minutes(2);

const claimWithConfig = async ({
	idempotencyKey,
	idempotencyConfig,
}: {
	idempotencyKey: string;
	idempotencyConfig: IdempotencyConfig | null;
}) => {
	const claimCtx = {
		...ctx,
		org: { ...ctx.org, idempotency_config: idempotencyConfig },
	} as typeof ctx;

	await withIdempotencyKey({
		ctx: claimCtx,
		idempotencyKey,
		routeGroup: RouteGroup.Balances,
		run: async () => "ok",
	});

	return buildIdempotencyStorageKey({
		orgId: ctx.org.id,
		env: ctx.env,
		idempotencyKey,
	}).storageKey;
};

const expectStoredTtls = async ({
	storageKey,
	ttlHours,
}: {
	storageKey: string;
	ttlHours: number;
}) => {
	const expectedTtlMs = ms.hours(ttlHours);

	// DynamoDB is the only idempotency store; the claim is awaited, so the item is already there.
	const { Item: item } = await getDynamoDocumentClient().send(
		new GetCommand({
			TableName: getIdempotencyTableName(),
			Key: { pk: storageKey },
		}),
	);

	expect(item).toBeDefined();
	const expiresAtMs = Number(item?.expiresAt) * 1000;
	expect(expiresAtMs).toBeGreaterThan(
		Date.now() + expectedTtlMs - TOLERANCE_MS,
	);
	expect(expiresAtMs).toBeLessThanOrEqual(Date.now() + expectedTtlMs);
};

describe("idempotency TTL config", () => {
	test.concurrent(
		"a configured balances TTL lands in Dynamo expiresAt",
		async () => {
			const storageKey = await claimWithConfig({
				idempotencyKey: `ttl-config-72h-${Date.now().toString(36)}`,
				idempotencyConfig: [
					{ routeGroup: RouteGroup.Balances, idempotencyTtl: 72 },
				],
			});

			await expectStoredTtls({ storageKey, ttlHours: 72 });
		},
	);

	test.concurrent(
		"an org without config falls back to the 24h default",
		async () => {
			const storageKey = await claimWithConfig({
				idempotencyKey: `ttl-config-default-${Date.now().toString(36)}`,
				idempotencyConfig: null,
			});

			await expectStoredTtls({
				storageKey,
				ttlHours: DEFAULT_IDEMPOTENCY_TTL_HOURS,
			});
		},
	);
});
