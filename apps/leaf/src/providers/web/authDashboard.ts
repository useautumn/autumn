import { verifyDashboardSession } from "@autumn/auth";
import { env } from "../../lib/env.js";

export type DashboardAuth = Readonly<{
	orgId: string;
	scopes: string[];
	userId: string;
}>;

export const authDashboard = async ({
	cookie,
}: {
	cookie?: string | null;
}): Promise<DashboardAuth | null> => {
	const session = await verifyDashboardSession({
		cookie,
		authBaseUrl: env.AUTUMN_API_URL,
	});
	if (!session?.activeOrganizationId) return null;
	return {
		orgId: session.activeOrganizationId,
		scopes: session.scopes,
		userId: session.userId,
	};
};
