import { InternalError, notNullish } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "../../../honoMiddlewares/routeHandler";
import { runDeductionTx } from "../../balances/track/trackUtils/runDeductionTx";
import { CusService } from "../CusService";
import { CusEntService } from "../cusProducts/cusEnts/CusEntitlementService";
import { deleteCachedApiCustomer } from "../cusUtils/apiCusCacheUtils/deleteCachedApiCustomer";

export const handleUpdateCusEntitlementV2 = createRoute({
	body: z.object({
		balance: z.number(),
		next_reset_at: z.number().nullish(),
		entity_id: z.string().nullish(),
	}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { customer_id, customer_entitlement_id } = c.req.param();
		const { balance, next_reset_at, entity_id } = c.req.valid("json");
		const { db, org, env } = ctx;

		const fullCus = await CusService.getFull({
			db,
			idOrInternalId: customer_id,
			orgId: org.id,
			env,
		});

		const cusEnt = fullCus.customer_products
			.flatMap((cp) => cp.customer_entitlements)
			.find((ce) => ce.id === customer_entitlement_id);
		if (!cusEnt) {
			throw new InternalError({
				message: `[update cus entitlement] Customer entitlement not found: ${customer_entitlement_id}`,
			});
		}

		console.log(
			`Updating cus ent: ${cusEnt.id} to balance: ${balance}, entity ID: ${entity_id}`,
		);
		await runDeductionTx({
			ctx,
			customerId: customer_id,
			entityId: entity_id ?? undefined,
			deductions: [
				{
					feature: cusEnt.entitlement.feature,
					deduction: 0,
					targetBalance: balance,
				},
			],
			skipAdditionalBalance: true,
			alterGrantedBalance: true,
			sortParams: {
				cusEntId: customer_entitlement_id,
			},
			refreshCache: false,
		});

		if (notNullish(next_reset_at) && next_reset_at !== cusEnt.next_reset_at) {
			await CusEntService.update({
				db,
				id: customer_entitlement_id,
				updates: {
					next_reset_at,
				},
			});
		}

		await deleteCachedApiCustomer({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId: customer_id,
			source: "handleUpdateBalance",
		});

		return c.json({ success: true });
	},
});
