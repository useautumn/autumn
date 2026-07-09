import {
	LicenseAttachParamsSchema,
	Scopes,
	UpdateLicenseParamsSchema,
} from "@autumn/shared";
import { Hono } from "hono";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { billingActions } from "@/internal/billing/v2/actions/index.js";
import { buildBillingLockKey } from "@/internal/billing/v2/utils/billingLock/buildBillingLockKey.js";

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
		const assignment = await billingActions.attachLicense({
			ctx,
			params: body,
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
		const assignment = await billingActions.updateLicense({
			ctx,
			params: body,
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
		const previewResult = await billingActions.attachLicense({
			ctx,
			params: body,
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
		const previewResult = await billingActions.updateLicense({
			ctx,
			params: body,
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
