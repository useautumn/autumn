import {
	AffectedResource,
	LicenseAssignParamsSchema,
	LicenseListAssignmentsParamsSchema,
	LicenseListPoolsParamsSchema,
	LicenseUnassignParamsSchema,
	LicenseUpdateParamsSchema,
	ListPlanLicensesParamsSchema,
	Scopes,
	SetPlanLicenseParamsSchema,
} from "@autumn/shared";
import { Hono } from "hono";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { buildBillingLockKey } from "@/internal/billing/v2/utils/billingLock/buildBillingLockKey.js";
import { LicenseService } from "./LicenseService.js";
import { getLicenseAssignmentResponse } from "./licenseResponseUtils.js";

export const licenseRpcRouter = new Hono<HonoEnv>();

const handleAssignLicense = createRoute({
	scopes: [Scopes.Billing.Write],
	body: LicenseAssignParamsSchema,
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
		const assignment = await LicenseService.assign({
			ctx,
			customerId: body.customer_id,
			entityId: body.entity_id,
			planId: body.plan_id,
			version: body.version,
			parentSubscriptionId: body.parent_subscription_id,
			metadata: body.metadata,
		});

		return c.json({
			assignment: await getLicenseAssignmentResponse({ ctx, assignment }),
		});
	},
});

const handleUnassignLicense = createRoute({
	scopes: [Scopes.Billing.Write],
	body: LicenseUnassignParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");
		const assignment = await LicenseService.unassign({
			ctx,
			assignmentId: body.assignment_id,
			customerId: body.customer_id,
			entityId: body.entity_id,
			planId: body.plan_id,
		});

		return c.json({ assignment });
	},
});

const handleListLicenseAssignments = createRoute({
	scopes: [Scopes.Billing.Read],
	body: LicenseListAssignmentsParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");
		const assignments = await LicenseService.listAssignments({
			ctx,
			customerId: body.customer_id,
			entityId: body.entity_id,
			planId: body.plan_id,
			active: body.active,
		});

		return c.json({ list: assignments });
	},
});

const handleListLicensePools = createRoute({
	scopes: [Scopes.Billing.Read],
	body: LicenseListPoolsParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");
		const pools = await LicenseService.listPools({
			ctx,
			customerId: body.customer_id,
			entityId: body.entity_id,
		});

		return c.json({ list: pools });
	},
});

const handleSetPlanLicense = createRoute({
	scopes: [Scopes.Plans.Write],
	body: SetPlanLicenseParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");
		const planLicense = await LicenseService.setPlanLicense({
			ctx,
			parentPlanId: body.parent_plan_id,
			licensePlanId: body.license_plan_id,
			includedQuantity: body.included_quantity,
			allowExtraQuantity: body.allow_extra_quantity,
			customize: body.customize,
			metadata: body.metadata,
		});

		return c.json({ plan_license: planLicense });
	},
});

const handleListPlanLicenses = createRoute({
	scopes: [Scopes.Plans.Read],
	body: ListPlanLicensesParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");
		const planLicenses = await LicenseService.listPlanLicenses({
			ctx,
			parentPlanId: body.parent_plan_id,
		});

		return c.json({ list: planLicenses });
	},
});

const handleUpdateLicense = createRoute({
	scopes: [Scopes.Plans.Write],
	body: LicenseUpdateParamsSchema,
	resource: AffectedResource.Product,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { license_plan_id, version, ...updates } = c.req.valid("json");
		const product = await LicenseService.update({
			ctx,
			licensePlanId: license_plan_id,
			version,
			updates,
		});

		return c.json(product);
	},
});

licenseRpcRouter.post("/licenses.assign", ...handleAssignLicense);
licenseRpcRouter.post("/licenses.unassign", ...handleUnassignLicense);
licenseRpcRouter.post(
	"/licenses.list_assignments",
	...handleListLicenseAssignments,
);
licenseRpcRouter.post("/licenses.list_pools", ...handleListLicensePools);
licenseRpcRouter.post("/licenses.update", ...handleUpdateLicense);
licenseRpcRouter.post("/licenses.set_plan_license", ...handleSetPlanLicense);
licenseRpcRouter.post(
	"/licenses.list_plan_licenses",
	...handleListPlanLicenses,
);
