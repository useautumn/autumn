import { ErrCode, RecaseError } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CacheManager } from "@/utils/cacheUtils/CacheManager.js";

const PostTrmnlDeviceIdSchema = z.object({
	deviceId: z.string(),
	hideRevenue: z.boolean().optional(),
});

/**
 * Save TRMNL device configuration for the authenticated organization
 */
export const handlePostTrmnlDeviceId = createRoute({
	body: PostTrmnlDeviceIdSchema,
	handler: async (c) => {
		const { org } = c.get("ctx");
		const { deviceId, hideRevenue } = c.req.valid("json");

		// Check if device is already registered to another org
		const existingConfig = await CacheManager.getJson<{
			orgId: string;
			hideRevenue: boolean;
		}>(`trmnl:device:${deviceId}`);

		if (existingConfig && existingConfig.orgId !== org.id) {
			throw new RecaseError({
				message: "Device ID already taken",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		// Get current org's trmnl config and clear old device mapping if exists
		const currentTrmnlConfig = await CacheManager.getJson<{
			deviceId: string;
			hideRevenue: boolean;
		}>(`trmnl:org:${org.id}`);

		if (currentTrmnlConfig) {
			await CacheManager.del(`trmnl:device:${currentTrmnlConfig.deviceId}`);
		}

		// Save new device-to-org mapping
		await CacheManager.setJson(`trmnl:device:${deviceId}`, {
			orgId: org.id,
			hideRevenue: hideRevenue ?? false,
		});

		// Save org-to-device mapping
		await CacheManager.setJson(`trmnl:org:${org.id}`, {
			deviceId,
			hideRevenue: hideRevenue ?? false,
		});

		return c.json({ message: "Device ID saved" });
	},
});
