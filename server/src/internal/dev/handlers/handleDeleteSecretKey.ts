import { Scopes } from "@autumn/shared";
import { createRoute } from "../../../honoMiddlewares/routeHandler";
import { clearSecretKeyCache } from "../apiKeys/cacheApiKeyUtils";
import { apiKeyRepo } from "../repos/index.js";

export const handleDeleteSecretKey = createRoute({
	scopes: [Scopes.ApiKeys.Write],
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org } = ctx;
		const { key_id } = c.req.param();

		const data = await apiKeyRepo.delete({
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
				clearSecretKeyCache({ hashedKey: apiKey.hashed_key! }),
			);
		}
		await Promise.all(batchInvalidate);

		return c.json({ message: "API key deleted", code: "api_key_deleted" }, 200);
	},
});
