import { ErrCode, RecaseError, Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import {
	deleteTrmnlDeviceConfig,
	getTrmnlDeviceConfig,
	getTrmnlOrgConfig,
	setTrmnlDeviceConfig,
	setTrmnlOrgConfig,
} from "@/external/redis/actions/trmnlDeviceStore/trmnlDeviceStore.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";

const PostTrmnlDeviceIdSchema = z.object({
	deviceId: z.string(),
	hideRevenue: z.boolean().optional(),
});

/**
 * Save TRMNL device configuration for the authenticated organization
 */
export const handlePostTrmnlDeviceId = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: PostTrmnlDeviceIdSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org } = ctx;
		const { deviceId, hideRevenue } = c.req.valid("json");

		// Check if device is already registered to another org
		const existingConfig = await getTrmnlDeviceConfig({ ctx, deviceId });

		if (existingConfig && existingConfig.orgId !== org.id) {
			throw new RecaseError({
				message: "Device ID already taken",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		// Get current org's trmnl config and clear old device mapping if exists
		const currentTrmnlConfig = await getTrmnlOrgConfig({ ctx, orgId: org.id });

		if (currentTrmnlConfig) {
			await deleteTrmnlDeviceConfig({
				ctx,
				deviceId: currentTrmnlConfig.deviceId,
			});
		}

		await setTrmnlDeviceConfig({
			ctx,
			deviceId,
			config: { orgId: org.id, hideRevenue: hideRevenue ?? false },
		});

		await setTrmnlOrgConfig({
			ctx,
			orgId: org.id,
			config: { deviceId, hideRevenue: hideRevenue ?? false },
		});

		return c.json({ message: "Device ID saved" });
	},
});
