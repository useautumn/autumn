import {
	CusProductStatus,
	cusProductsToCusEnts,
	FeatureNotFoundError,
	notNullish,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { z } from "zod/v4";
import { createRoute } from "../../../honoMiddlewares/routeHandler.js";
import { CusService } from "../../customers/CusService.js";
import { getApiCusFeature } from "../../customers/cusUtils/apiCusUtils/getApiCusFeature/getApiCusFeature.js";
import { deductFromAdditionalGrantedBalance } from "../deductUtils/deductFromAdditionalGrantedBalance.js";

export const handleUpdateBalance = createRoute({
	body: z
		.object({
			customer_id: z.string(),
			entity_id: z.string().optional(),
			feature_id: z.string(),

			current_balance: z.number().min(0).optional(),
			usage: z.number().optional(),

			// Internal
		})
		.refine(
			(data) => {
				if (notNullish(data.current_balance) && notNullish(data.usage)) {
					return false;
				}
				return true;
			},
			{
				message: "'balance' and 'usage' cannot both be provided",
			},
		),

	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");

		const { db, org, env, features } = ctx;

		const fullCus = await CusService.getFull({
			db,
			idOrInternalId: body.customer_id,
			orgId: org.id,
			env,
		});

		const feature = features.find((f) => f.id === body.feature_id);
		if (!feature) {
			throw new FeatureNotFoundError({ featureId: body.feature_id });
		}

		const cusEnts = cusProductsToCusEnts({
			cusProducts: fullCus.customer_products,
			inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
		});

		const { apiCusFeature } = getApiCusFeature({
			ctx,
			fullCus,
			cusEnts,
			feature,
		});

		// Udpate balance...
		if (notNullish(body.current_balance)) {
			const toDeduct = new Decimal(apiCusFeature.current_balance)
				.minus(body.current_balance)
				.toNumber();

			// Add to additional granted balance
			await deductFromAdditionalGrantedBalance({
				toDeduct,
				cusEnts,
				feature,
				entity: fullCus.entity,
				ctx,
			});
		}

		// Return apiCusFeature
		return c.json({ success: true });
	},
});
