import {
	LicenseAttachParamsSchema,
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
	lock:
		process.env.NODE_ENV !== "development"
			? {
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
				}
			: undefined,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");
		const assignment = await attachLicense({
			ctx,
			customerId: body.customer_id,
			entityId: body.entity_id,
			planId: body.plan_id,
			parentPlanId: body.parent_plan_id,
		});

		return c.json({ assignment });
	},
});

const handleUpdateLicense = createRoute({
	scopes: [Scopes.Billing.Write],
	body: UpdateLicenseParamsSchema,
	lock:
		process.env.NODE_ENV !== "development"
			? {
					ttlMs: 120000,
					errorMessage:
						"License update already in progress for this customer, try again in a few seconds",
					getKey: (c) => {
						const ctx = c.get("ctx");
						const body = c.req.valid("json");
						return buildBillingLockKey({
							orgId: ctx.org.id,
							env: ctx.env,
							customerId: body.customer_id,
						});
					},
				}
			: undefined,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");
		const assignment = await updateLicense({
			ctx,
			customerId: body.customer_id,
			assignmentId: body.assignment_id,
			cancelAction: body.cancel_action,
		});

		return c.json({ assignment });
	},
});

const handlePreviewAttachLicense = createRoute({
	scopes: [Scopes.Billing.Read],
	body: LicenseAttachParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");
		const previewResult = await attachLicense({
			ctx,
			customerId: body.customer_id,
			entityId: body.entity_id,
			planId: body.plan_id,
			parentPlanId: body.parent_plan_id,
			preview: true,
		});

		return c.json(previewResult);
	},
});

const handlePreviewUpdateLicense = createRoute({
	scopes: [Scopes.Billing.Read],
	body: UpdateLicenseParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");
		const previewResult = await updateLicense({
			ctx,
			customerId: body.customer_id,
			assignmentId: body.assignment_id,
			cancelAction: body.cancel_action,
			preview: true,
		});

		return c.json(previewResult);
	},
});

licenseRpcRouter.post("/licenses.attach", ...handleAttachLicense);
licenseRpcRouter.post("/licenses.update", ...handleUpdateLicense);
licenseRpcRouter.post(
	"/licenses.preview_attach",
	...handlePreviewAttachLicense,
);
licenseRpcRouter.post(
	"/licenses.preview_update",
	...handlePreviewUpdateLicense,
);
