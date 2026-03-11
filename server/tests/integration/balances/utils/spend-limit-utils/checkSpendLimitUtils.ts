import { expect } from "bun:test";
import type { CheckResponseV3 } from "@autumn/shared";
import { timeout } from "@tests/utils/genUtils.js";
import type { AutumnV2_1Client } from "./entitySpendLimitUtils.js";

export const normalizeCheckResponse = (response: CheckResponseV3) => ({
	allowed: response.allowed,
	customer_id: response.customer_id,
	entity_id: response.entity_id ?? null,
	required_balance: response.required_balance ?? null,
	balance: response.balance
		? {
				feature_id: response.balance.feature_id,
				granted: response.balance.granted,
				remaining: response.balance.remaining,
				usage: response.balance.usage,
				unlimited: response.balance.unlimited,
				overage_allowed: response.balance.overage_allowed,
				max_purchase: response.balance.max_purchase,
				breakdown:
					response.balance.breakdown?.map((item) => ({
						plan_id: item.plan_id,
						included_grant: item.included_grant,
						prepaid_grant: item.prepaid_grant,
						remaining: item.remaining,
						usage: item.usage,
						unlimited: item.unlimited,
						billing_method: item.price?.billing_method ?? null,
						max_purchase: item.price?.max_purchase ?? null,
						reset_interval: item.reset?.interval ?? null,
					})) ?? [],
			}
		: null,
});

export const expectBoundaryAndParity = async ({
	autumn,
	customerId,
	entityId,
	featureId,
	allowedRequiredBalance,
	blockedRequiredBalance,
	expectedFeatureId = featureId,
	expectedAllowedResponseRequiredBalance = allowedRequiredBalance,
	expectedBlockedResponseRequiredBalance = blockedRequiredBalance,
}: {
	autumn: AutumnV2_1Client;
	customerId: string;
	entityId?: string;
	featureId: string;
	allowedRequiredBalance: number;
	blockedRequiredBalance: number;
	expectedFeatureId?: string;
	expectedAllowedResponseRequiredBalance?: number;
	expectedBlockedResponseRequiredBalance?: number;
}) => {
	const allowedCached = await autumn.check<CheckResponseV3>({
		customer_id: customerId,
		...(entityId ? { entity_id: entityId } : {}),
		feature_id: featureId,
		required_balance: allowedRequiredBalance,
	});

	const blockedCached = await autumn.check<CheckResponseV3>({
		customer_id: customerId,
		...(entityId ? { entity_id: entityId } : {}),
		feature_id: featureId,
		required_balance: blockedRequiredBalance,
	});

	expect(allowedCached.allowed).toBe(true);
	expect(blockedCached.allowed).toBe(false);
	expect(allowedCached.balance?.feature_id).toBe(expectedFeatureId);
	expect(blockedCached.balance?.feature_id).toBe(expectedFeatureId);
	expect(allowedCached.required_balance).toBe(
		expectedAllowedResponseRequiredBalance,
	);
	expect(blockedCached.required_balance).toBe(
		expectedBlockedResponseRequiredBalance,
	);

	await timeout(4000);

	const allowedUncached = await autumn.check<CheckResponseV3>({
		customer_id: customerId,
		...(entityId ? { entity_id: entityId } : {}),
		feature_id: featureId,
		required_balance: allowedRequiredBalance,
		skip_cache: true,
	});

	const blockedUncached = await autumn.check<CheckResponseV3>({
		customer_id: customerId,
		...(entityId ? { entity_id: entityId } : {}),
		feature_id: featureId,
		required_balance: blockedRequiredBalance,
		skip_cache: true,
	});

	expect(normalizeCheckResponse(allowedUncached)).toEqual(
		normalizeCheckResponse(allowedCached),
	);
	expect(normalizeCheckResponse(blockedUncached)).toEqual(
		normalizeCheckResponse(blockedCached),
	);
};
