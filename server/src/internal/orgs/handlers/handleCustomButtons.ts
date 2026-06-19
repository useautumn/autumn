import { type CustomButton, CustomButtonSchema, Scopes } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { clearOrgCache } from "../orgUtils/clearOrgCache.js";

export const handleGetCustomButtons = createRoute({
	scopes: [Scopes.Organisation.Read],
	handler: (c) => {
		const { org } = c.get("ctx");
		return c.json({ custom_buttons: org.custom_buttons ?? [] });
	},
});

const bodySchema = z.object({
	custom_buttons: z.array(CustomButtonSchema),
});

export const handleUpdateCustomButtons = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: bodySchema,
	handler: async (c) => {
		const { db, org } = c.get("ctx");
		const { custom_buttons } = c.req.valid("json");

		const rows = await db.execute<{ custom_buttons: CustomButton[] }>(
			sql`UPDATE organizations
				SET custom_buttons = ${JSON.stringify(custom_buttons)}::jsonb
				WHERE id = ${org.id}
				RETURNING custom_buttons`,
		);

		await clearOrgCache({ db, orgId: org.id });

		const updated =
			(rows as unknown as { custom_buttons: CustomButton[] }[])[0]
				?.custom_buttons ?? [];
		return c.json({ custom_buttons: updated });
	},
});
