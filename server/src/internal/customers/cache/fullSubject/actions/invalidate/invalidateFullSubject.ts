import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { incrementFullSubjectCustomerEpoch } from "./incrementFullSubjectCustomerEpoch.js";
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

	await incrementFullSubjectCustomerEpoch({
		ctx,
		customerId,
	});
};
