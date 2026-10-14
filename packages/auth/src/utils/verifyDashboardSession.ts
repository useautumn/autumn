export type DashboardSession = {
	userId: string;
	activeOrganizationId: string | null;
	scopes: string[];
};

export const verifyDashboardSession = async ({
	cookie,
	authBaseUrl,
}: {
	cookie: string | null | undefined;
	authBaseUrl: string;
}): Promise<DashboardSession | null> => {
	if (!cookie) {
		return null;
	}
	const response = await fetch(`${authBaseUrl}/api/auth/get-session`, {
		headers: { cookie },
	});
	if (!response.ok) {
		return null;
	}
	const data = (await response.json()) as {
		user?: { id?: string };
		session?: { activeOrganizationId?: string | null };
		scopes?: string[];
	} | null;
	if (!data?.user?.id) {
		return null;
	}
	return {
		userId: data.user.id,
		activeOrganizationId: data.session?.activeOrganizationId ?? null,
		scopes: Array.isArray(data.scopes) ? data.scopes : [],
	};
};
