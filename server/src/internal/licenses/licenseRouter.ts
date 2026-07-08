import {
	LicenseAttachParamsSchema,
	LicenseListAssignmentsParamsSchema,
	LicenseListPoolsParamsSchema,
	LinkLicenseParamsSchema,
	ListLicenseLinksParamsSchema,
	Scopes,
	UpdateLicenseParamsSchema,
} from "@autumn/shared";
import { Hono } from "hono";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { buildBillingLockKey } from "@/internal/billing/v2/utils/billingLock/buildBillingLockKey.js";
import { attachLicense } from "./actions/assignments/attach/attachLicense.js";
import { updateLicense } from "./actions/assignments/update/updateLicense.js";

export const licenseRpcRouter = new Hono<HonoEnv>();

const handleAttachLicense = createRoute({
	scopes: [Scopes.Billing.Write],
	body: LicenseAttachParamsSchema,
	lock: {
		ttlMs: 120000,
		errorMessage:
			"License assignment already in progress for this customer, try again in a few seconds",
		getKey: (c) => {
			const ctx = c.get("ctx");
			const body = c.req.valid("json");
			return buildBillingLockKey({
				orgId: ctx.org.id,
				env: ctx.env,
				customerId: body.customer_id,
			});
		},
	},
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");
		const assignment = await attachLicense({
			ctx,
			customerId: body.customer_id,
			entityId: body.entity_id,
			planId: body.plan_id,
			poolId: body.pool_id,
			parentSubscriptionId: body.parent_subscription_id,
		});

		return c.json({ assignment });
	},
});

const handleUpdateLicense = createRoute({
	scopes: [Scopes.Billing.Write],
	body: UpdateLicenseParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");
		const assignment = await updateLicense({
			ctx,
			assignmentId: body.assignment_id,
			cancelAction: body.cancel_action,
		});

		return c.json({ assignment });
	},
});

licenseRpcRouter.post("/licenses.attach", ...handleAttachLicense);
licenseRpcRouter.post("/licenses.update", ...handleUpdateLicense);
