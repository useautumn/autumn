import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { incrementFullSubjectViewEpoch } from "./incrementFullSubjectViewEpoch.js";
import { invalidateCachedFullSubjectExact } from "./invalidateFullSubjectExact.js";
import { invalidateSharedBalanceFields } from "./invalidateSharedBalanceFields.js";

export const invalidateCachedFullSubject = async ({
	customerId,
	entityId,
	ctx,
	source,
}: {
	customerId: string;
	entityId?: string;
	ctx: AutumnContext;
	source?: string;
}): Promise<void> => {
	if (!customerId) return;

	await invalidateSharedBalanceFields({
		ctx,
		customerId,
	});

	await invalidateCachedFullSubjectExact({
		ctx,
		customerId,
		source,
	});

	if (entityId) {
		await invalidateCachedFullSubjectExact({
			ctx,
			customerId,
			entityId,
			source,
		});
	}

	await incrementFullSubjectViewEpoch({
		ctx,
		customerId,
	});
};
