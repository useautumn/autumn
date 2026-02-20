import type { BetterAuthOrganization, BetterAuthSession } from "../types";

/** Get active organization from Better Auth context */
export const getActiveOrganization = async (
	ctx: unknown,
	session: BetterAuthSession | null,
): Promise<BetterAuthOrganization | null> => {
	if (!session?.session?.activeOrganizationId) return null;

	try {
		const context = (ctx as { context?: { adapter?: unknown } }).context;
		if (!context?.adapter) return null;

		const adapter = context.adapter as {
			findOne: (params: {
				model: string;
				where: { field: string; value: string }[];
			}) => Promise<BetterAuthOrganization | null>;
		};

		const org = await adapter.findOne({
			model: "organization",
			where: [{ field: "id", value: session.session.activeOrganizationId }],
		});

		return org;
	} catch {
		return null;
	}
};
