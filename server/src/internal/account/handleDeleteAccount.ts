import { RecaseError, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { deleteAccount } from "./deleteAccount.js";

export const handleDeleteAccount = createRoute({
	scopes: [Scopes.Public],
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, logger, userId, impersonatedBy } = ctx;

		if (!userId) {
			throw new RecaseError({
				message: "Unauthorized - no user id found",
				statusCode: 401,
			});
		}

		if (impersonatedBy) {
			throw new RecaseError({
				message: "Can't delete an account while impersonating",
				statusCode: 403,
			});
		}

		await deleteAccount({ db, userId, logger });

		return c.json({ message: "Account deleted" });
	},
});
