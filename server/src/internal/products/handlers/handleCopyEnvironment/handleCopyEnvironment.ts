import { AppEnv, RecaseError } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { ProductService } from "../../ProductService.js";
import { handleCopyFeatures } from "./handleCopyFeatures.js";
import { handleCopyProducts } from "./handleCopyProducts.js";

export const handleCopyEnvironment = createRoute({
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org } = ctx;
		const body = await c.req.json().catch(() => ({}));
		const fromEnv = body.from === AppEnv.Live || body.from === "live" ? AppEnv.Live : AppEnv.Sandbox;
		const toEnv = fromEnv === AppEnv.Live ? AppEnv.Sandbox : AppEnv.Live;

		const [sourceFeatures, targetFeatures, sourceProducts, targetProducts] = await Promise.all([
			FeatureService.list({ db, orgId: org.id, env: fromEnv }),
			FeatureService.list({ db, orgId: org.id, env: toEnv }),
			ProductService.list({ db, orgId: org.id, env: fromEnv }),
			ProductService.list({ db, orgId: org.id, env: toEnv }),
		]);

		const sourceDefault = sourceProducts.find((p) => p.is_default);
		const targetDefault = targetProducts.find((p) => p.is_default);
		if (sourceDefault && targetDefault && sourceDefault.id !== targetDefault.id) {
			throw new RecaseError({
				message: `Cannot sync: "${sourceDefault.name}" is default in source but "${targetDefault.name}" is default in target. Remove default from one product first.`,
				statusCode: 400,
			});
		}

		await handleCopyFeatures({
			ctx,
			sourceFeatures,
			targetFeatures,
			toEnv,
		});

		await handleCopyProducts({
			ctx,
			fromEnv,
			toEnv,
		});

		const targetEnvName = toEnv === AppEnv.Live ? "production" : "sandbox";
		return c.json({
			message: `Products copied to ${targetEnvName}`,
		});
	},
});
