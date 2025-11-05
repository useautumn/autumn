import type { Customer } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { handleCreateCustomer } from "@/internal/customers/handlers/handleCreateCustomer.js";
import type { VercelUpsertInstallation } from "../vercelTypes.js";

export const handleCreateInstallation = createRoute({
	handler: async (c) => {
		console.log("Vercel Webhook Router: PUT /installations");
		console.log("Vercel Webhook Router: req.params", c.req.param());

		const body = await c.req.json<VercelUpsertInstallation>();
		console.log("Vercel Webhook Router: req.body", body);

		const ctx = c.get("ctx");
		console.log("Vercel Webhook Router: ctx.org", ctx.org);
		console.log("Vercel Webhook Router: ctx.env", ctx.env);
		console.log("Vercel Webhook Router: ctx.features", ctx.features);

		const { integrationConfigurationId } = c.req.param();
		let createdCustomer: Customer | null = null;

		try {
			// Create a compatible request object for handleCreateCustomer
			const req = {
				...ctx,
				logtail: ctx.logger,
				orgId: ctx.org.id,
			};

			createdCustomer = await handleCreateCustomer({
				req: req as any,
				cusData: {
					id: integrationConfigurationId,
					email: body.account.contact.email,
					name: body.account.contact.name,
					metadata: {
						vercel_installation_id: integrationConfigurationId,
					},
				},
			});
		} catch (_) {
			console.log(
				"ERROR: Error creating customer: --------------------------------",
			);
			console.log(_);
			console.log(ctx.org);
			console.log("--------------------------------");
		}

		if (createdCustomer) return c.body(null, 200);
		return c.body(null, 500);
	},
});
