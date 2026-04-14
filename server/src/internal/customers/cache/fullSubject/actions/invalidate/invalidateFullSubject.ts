import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { incrementFullSubjectViewEpoch } from "./incrementFullSubjectViewEpoch.js";
import { invalidateCachedFullSubjectExact } from "./invalidateFullSubjectExact.js";

export const invalidateCachedFullSubject = async ({
	customerId,
	entityId,
	ctx,
	source,
	skipGuard = false,
}: {
	customerId: string;
	entityId?: string;
	ctx: AutumnContext;
	source?: string;
	skipGuard?: boolean;
}): Promise<void> => {
	if (!customerId) return;

	await invalidateCachedFullSubjectExact({
		ctx,
		customerId,
		source,
		skipGuard,
	});

	if (entityId) {
		await invalidateCachedFullSubjectExact({
			ctx,
			customerId,
			entityId,
			source,
			skipGuard,
		});
	}

	await incrementFullSubjectViewEpoch({
		ctx,
		customerId,
	});
};
