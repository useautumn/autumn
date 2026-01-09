import { expect } from "bun:test";
import { type ApiEntityV0, ApiVersion } from "@autumn/shared";
import { AutumnInt } from "@/external/autumn/autumnCli";

const defaultAutumn = new AutumnInt({ version: ApiVersion.V1_2 });

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Verify an entity has the expected feature with correct balance/usage values.
 * Uses ApiEntityV0 which has `features` with `balance` property (V1.2 format).
 */
export const expectEntityFeatureCorrect = async ({
	customerId,
	entityId,
	entity: providedEntity,
	featureId,
	balance,
	usage,
	resetsAt,
}: {
	customerId?: string;
	entityId?: string;
	entity?: ApiEntityV0;
	featureId: string;
	balance?: number;
	usage?: number;
	resetsAt?: number;
}) => {
	const entity = providedEntity
		? providedEntity
		: await defaultAutumn.entities.get(customerId!, entityId!);

	const feature = entity.features?.[featureId];

	if (balance !== undefined) {
		expect(feature?.balance).toBe(balance);
	}

	if (usage !== undefined) {
		expect(feature?.usage).toBe(usage);
	}

	if (resetsAt !== undefined) {
		const actualResetsAt = feature?.next_reset_at ?? 0;
		expect(actualResetsAt).toBeDefined();
		expect(Math.abs(actualResetsAt - resetsAt)).toBeLessThanOrEqual(
			ONE_HOUR_MS,
		);
	}
};

/**
 * Verify an entity has a specific feature defined.
 */
export const expectEntityFeatureExists = async ({
	customerId,
	entityId,
	entity: providedEntity,
	featureId,
}: {
	customerId?: string;
	entityId?: string;
	entity?: ApiEntityV0;
	featureId: string;
}) => {
	const entity = providedEntity
		? providedEntity
		: await defaultAutumn.entities.get(customerId!, entityId!);

	const feature = entity.features?.[featureId];
	expect(feature).toBeDefined();
};
