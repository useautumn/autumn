import { expect } from "bun:test";
import {
	type ApiEntityV2,
	type DbUsageLimit,
	type EntityBillingControls,
	ResetInterval,
} from "@autumn/shared";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";

/**
 * Arms a windowed hard usage cap via the ENTITY's `usage_limits` billing
 * control (sibling of setCustomerUsageLimit / setEntitySpendLimit).
 */
export const setEntityUsageLimit = async ({
	autumn,
	customerId,
	entityId,
	featureId,
	limit,
	interval = ResetInterval.Month,
}: {
	autumn: AutumnInt;
	customerId: string;
	entityId: string;
	featureId: string;
	limit: number;
	interval?: DbUsageLimit["interval"];
}) => {
	const billingControls: EntityBillingControls = {
		usage_limits: [
			{
				feature_id: featureId,
				limit,
				interval,
			},
		],
	};

	await timeout(2000);
	await autumn.entities.update(customerId, entityId, {
		billing_controls: billingControls,
	});
	await timeout(3000);
};

/**
 * Fetches the entity and asserts its own `billing_controls.usage_limits`
 * entry: configured `limit` and the current window's `usage`.
 */
export const expectEntityUsageLimit = async ({
	autumn,
	customerId,
	entityId,
	featureId,
	usage,
	limit,
	skipCache = false,
}: {
	autumn: AutumnInt;
	customerId: string;
	entityId: string;
	featureId: string;
	usage?: number;
	limit?: number;
	skipCache?: boolean;
}) => {
	const entity = await autumn.entities.get<ApiEntityV2>(
		customerId,
		entityId,
		skipCache ? { skip_cache: "true" } : undefined,
	);
	const usageLimit = entity.billing_controls?.usage_limits?.find(
		(entry) => entry.feature_id === featureId,
	);
	expect(
		usageLimit,
		`Missing entity usage_limits entry for ${featureId}`,
	).toBeDefined();

	if (typeof limit !== "undefined") {
		expect(usageLimit?.limit).toBe(limit);
	}

	if (typeof usage !== "undefined") {
		expect(usageLimit?.usage ?? 0).toBe(usage);
	}
};
