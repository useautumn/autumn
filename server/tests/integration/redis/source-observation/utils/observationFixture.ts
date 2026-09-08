import { randomUUID } from "node:crypto";
import { AppEnv } from "@autumn/shared";
import { Redis } from "ioredis";
import { DEDUCT_FROM_SUBJECT_BALANCES_SCRIPT } from "@/_luaScriptsV2/luaScriptsV2.js";
import type { BalanceObservation } from "@/internal/balances/shadow/balanceObservation.js";
import type { LuaDeductionResult } from "@/internal/balances/utils/types/redisDeductionResult.js";
import { buildDeductFromSubjectBalancesKeys } from "@/internal/customers/cache/fullSubject/builders/buildDeductFromSubjectBalancesKeys.js";
import { buildFullSubjectViewEpochKey } from "@/internal/customers/cache/fullSubject/builders/buildFullSubjectViewEpochKey.js";
import { buildSharedFullSubjectBalanceKey } from "@/internal/customers/cache/fullSubject/builders/buildSharedFullSubjectBalanceKey.js";

type ObservedResult = LuaDeductionResult & {
	observation?: BalanceObservation;
	observation_error?: string;
};

export function createObservationFixture({ name }: { name: string }) {
	const socket = process.env.BALANCE_OBSERVATION_TEST_REDIS_SOCKET;
	if (!socket)
		throw new Error(
			"BALANCE_OBSERVATION_TEST_REDIS_SOCKET must name an isolated local Redis Unix socket",
		);
	const redis = new Redis({
		path: socket,
		maxRetriesPerRequest: 0,
		retryStrategy: () => null,
	});
	const identity = {
		orgId: "observation_test",
		env: AppEnv.Sandbox,
		customerId: `observation-${name}-${process.pid}`,
	};
	const epochKey = buildFullSubjectViewEpochKey(identity);
	const metadataKey = `{${identity.customerId}}:${identity.orgId}:${identity.env}:balance_observation`;
	const lockKey = `{${identity.customerId}}:${identity.orgId}:${identity.env}:lock`;
	const ownedKeys = new Set([epochKey, metadataKey, lockKey]);
	const balanceKey = ({ featureId = "messages" } = {}) => {
		const key = buildSharedFullSubjectBalanceKey({ ...identity, featureId });
		ownedKeys.add(key);
		return key;
	};
	const markerKey = ({
		requestId,
		featureId = "messages",
	}: {
		requestId: string;
		featureId?: string;
	}) => {
		const key = `{${identity.customerId}}:${identity.orgId}:${identity.env}:idempotency:${requestId}:${featureId}`;
		ownedKeys.add(key);
		return key;
	};

	const seed = async ({
		balance = 10,
		featureId = "messages",
		epoch = 0,
		ttl = 300_000,
	} = {}) => {
		await redis.set(epochKey, String(epoch), "PX", ttl);
		await redis.hset(
			balanceKey({ featureId }),
			featureId,
			JSON.stringify({
				balance,
				adjustment: 0,
				additional_balance: 0,
				unlimited: false,
				next_reset_at: null,
				expires_at: null,
			}),
		);
	};

	const run = async ({
		requestId = randomUUID(),
		featureId = "messages",
		value = 5,
		capture = true,
		kind = "deduct",
		params = {},
		sha,
		script = DEDUCT_FROM_SUBJECT_BALANCES_SCRIPT,
	}: {
		requestId?: string;
		featureId?: string;
		value?: number;
		capture?: boolean;
		kind?: string;
		params?: Record<string, unknown>;
		script?: string;
		sha?: string;
	} = {}): Promise<ObservedResult> => {
		const { keys, balanceKeyIndexByFeatureId, observationKeyIndex } =
			buildDeductFromSubjectBalancesKeys({
				...identity,
				routingKey: balanceKey({ featureId }),
				lockReceiptKey: lockKey,
				idempotencyKey: markerKey({ requestId, featureId }),
				customerEntitlementDeductions: [{ feature_id: featureId }],
				fallbackFeatureId: featureId,
				observationMetadataKey: capture ? metadataKey : undefined,
			});
		const input = {
			org_id: identity.orgId,
			env: identity.env,
			customer_id: identity.customerId,
			feature_id: featureId,
			customer_entitlement_deductions: [
				{
					customer_entitlement_id: featureId,
					feature_id: featureId,
					credit_cost: 1,
					usage_allowed: false,
				},
			],
			balance_key_index_by_feature_id: balanceKeyIndexByFeatureId,
			amount_to_deduct: value,
			overage_behaviour: "reject",
			idempotency_ttl_ms: 86_400_000,
			expected_subject_view_epoch: 0,
			...(capture
				? {
						observation: {
							metadata_key_index: observationKeyIndex,
							incarnation: randomUUID(),
							request_id: requestId,
							kind,
							reason: null,
						},
					}
				: {}),
			...params,
		};
		const raw = sha
			? await redis.evalsha(sha, keys.length, ...keys, JSON.stringify(input))
			: await redis.eval(script, keys.length, ...keys, JSON.stringify(input));
		return JSON.parse(String(raw)) as ObservedResult;
	};

	return {
		redis,
		identity,
		epochKey,
		metadataKey,
		lockKey,
		balanceKey,
		markerKey,
		seed,
		run,
		reset: async () => {
			await redis.del(...ownedKeys);
		},
		close: async () => {
			await redis.del(...ownedKeys);
			redis.disconnect();
		},
	};
}
