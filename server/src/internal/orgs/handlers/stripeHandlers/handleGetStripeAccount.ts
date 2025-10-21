import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { isStripeConnected } from "../../orgUtils.js";

export const handleGetStripeAccount = createRoute({
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org, env } = ctx;

		if (!isStripeConnected({ org, env })) {
			return c.json(null);
		}

		const stripeCli = createStripeCli({ org, env });
		const account_details = await stripeCli.accounts.retrieve();

		return c.json(account_details);
	},
});
