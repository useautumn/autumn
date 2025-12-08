import { createRoute } from "../../../honoMiddlewares/routeHandler";
import { CacheManager } from "../../../utils/cacheUtils/CacheManager";
import { CacheType } from "../../../utils/cacheUtils/CacheType";
import { ApiKeyService } from "../ApiKeyService";

export const handleDeleteSecretKey = createRoute({
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org } = ctx;
		const { key_id } = c.req.param();

		const data = await ApiKeyService.delete({
			db,
			id: key_id,
			orgId: org.id,
		});

		if (data.length === 0) {
			console.error("API key not found");
			return c.json({ error: "API key not found" }, 404);
		}

		const batchInvalidate = [];
		for (const apiKey of data) {
			batchInvalidate.push(
				CacheManager.invalidate({
					action: CacheType.SecretKey,
					value: apiKey.hashed_key!,
				}),
			);
		}
		await Promise.all(batchInvalidate);

		return c.json({ message: "API key deleted", code: "api_key_deleted" }, 200);
	},
});
