export type DashboardSession = {
	userId: string;
	activeOrganizationId: string | null;
};

/**
 * Verify a dashboard better-auth session by calling the server's get-session
 * endpoint with the request's cookies. Lets a non-server service (e.g. Leaf)
 * authenticate a dashboard request without reconstructing the auth instance.
 * Returns null when unauthenticated.
 */
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
	} | null;
	if (!data?.user?.id) {
		return null;
	}
	return {
		userId: data.user.id,
		activeOrganizationId: data.session?.activeOrganizationId ?? null,
	};
};
