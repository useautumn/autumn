import {
	FeatureNotFoundError,
	notNullish,
	resetIntvToEntIntv,
	UpdateBalanceParamsSchema,
} from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "../../../honoMiddlewares/routeHandler.js";
import { CusService } from "../../customers/CusService.js";
import { deleteCachedApiCustomer } from "../../customers/cusUtils/apiCusCacheUtils/deleteCachedApiCustomer.js";
import { runDeductionTx } from "../track/trackUtils/runDeductionTx.js";
import { updateGrantedBalance } from "../updateGrantedBalance/updateGrantedBalance.js";

export const handleUpdateBalance = createRoute({
	body: UpdateBalanceParamsSchema.extend({
		customer_entitlement_id: z.string().optional(),
	}),

	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");

		const { features } = ctx;

		const feature = features.find((f) => f.id === body.feature_id);
		if (!feature) {
			throw new FeatureNotFoundError({ featureId: body.feature_id });
		}

		// Update balance using SQL with alter_granted=true
		if (notNullish(body.current_balance)) {
			await runDeductionTx({
				ctx,
				customerId: body.customer_id,
				entityId: body.entity_id,
				deductions: [
					{
						feature,
						deduction: 0,
						targetBalance: body.current_balance,
					},
				],
				skipAdditionalBalance: true,
				alterGrantedBalance: true,
				sortParams: {
					cusEntId: body.customer_entitlement_id,
					interval: body.interval
						? resetIntvToEntIntv({ resetIntv: body.interval })
						: undefined,
				},
				refreshCache: false,
			});
		}

		if (notNullish(body.granted_balance)) {
			ctx.logger.info(
				`updating granted balance for feature ${feature.id} to ${body.granted_balance}`,
			);
			const fullCus = await CusService.getFull({
				db: ctx.db,
				idOrInternalId: body.customer_id,
				orgId: ctx.org.id,
				env: ctx.env,
			});

			await updateGrantedBalance({
				ctx,
				fullCus,
				featureId: body.feature_id,
				targetGrantedBalance: body.granted_balance,
				sortParams: {
					cusEntId: body.customer_entitlement_id,
					interval: body.interval
						? resetIntvToEntIntv({ resetIntv: body.interval })
						: undefined,
				},
			});
		}

		await deleteCachedApiCustomer({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId: body.customer_id,
			source: "handleUpdateBalance",
		});

		return c.json({ success: true });
	},
});
