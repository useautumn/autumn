import {
	LicenseAttachParamsSchema,
	LicenseListAssignmentsParamsSchema,
	LicenseListParamsSchema,
	LinkLicenseParamsSchema,
	ListLicenseLinksParamsSchema,
	Scopes,
	UpdateLicenseParamsSchema,
} from "@autumn/shared";
import { Hono } from "hono";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { billingActions } from "@/internal/billing/v2/actions/index.js";
import { buildBillingLockKey } from "@/internal/billing/v2/utils/billingLock/buildBillingLockKey.js";
import { listLicenseAssignments } from "./actions/assignments/list/listLicenseAssignments.js";
import { listLicenses } from "./actions/assignments/list/listLicenses.js";
import { linkLicense } from "./actions/links/linkLicense.js";
import { listLicenseLinks } from "./actions/links/listLicenseLinks.js";

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

const handleListLicenseAssignments = createRoute({
	scopes: [Scopes.Billing.Read],
	body: LicenseListAssignmentsParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");
		const assignments = await listLicenseAssignments({
			ctx,
			customerId: body.customer_id,
			entityId: body.entity_id,
			planId: body.plan_id,
			active: body.active,
		});

		return c.json({ list: assignments });
	},
});

const handleListLicenses = createRoute({
	scopes: [Scopes.Billing.Read],
	body: LicenseListParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");
		const balances = await listLicenses({
			ctx,
			customerId: body.customer_id,
			entityId: body.entity_id,
		});

		return c.json({ list: balances });
	},
});

const handleLinkLicense = createRoute({
	scopes: [Scopes.Plans.Write],
	body: LinkLicenseParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");
		const planLicense = await linkLicense({ ctx, params: body });

		return c.json({ plan_license: planLicense });
	},
});

const handleListLicenseLinks = createRoute({
	scopes: [Scopes.Plans.Read],
	body: ListLicenseLinksParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");
		const planLicenses = await listLicenseLinks({
			ctx,
			parentPlanId: body.parent_plan_id,
		});

		return c.json({ list: planLicenses });
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
licenseRpcRouter.post(
	"/licenses.list_assignments",
	...handleListLicenseAssignments,
);
licenseRpcRouter.post("/licenses.list", ...handleListLicenses);
licenseRpcRouter.post("/licenses.link", ...handleLinkLicense);
licenseRpcRouter.post("/licenses.list_links", ...handleListLicenseLinks);
