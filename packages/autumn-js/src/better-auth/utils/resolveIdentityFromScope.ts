import type {
	BetterAuthOrganization,
	BetterAuthSession,
	CustomerScope,
} from "../types";

/** Resolve customer identity based on customerScope */
export const resolveIdentityFromScope = ({
	session,
	organization,
	customerScope,
}: {
	session: BetterAuthSession | null;
	organization: BetterAuthOrganization | null;
	customerScope: CustomerScope;
}) => {
	if (!session?.user) return null;

	const userIdentity = {
		customerId: session.user.id,
		customerData: {
			name: session.user.name,
			email: session.user.email,
		},
	};

	const orgIdentity = organization
		? {
				customerId: organization.id,
				customerData: { name: organization.name },
			}
		: null;

	switch (customerScope) {
		case "organization":
			return orgIdentity;

		case "user_and_organization":
			return orgIdentity ?? userIdentity;

		default:
			return userIdentity;
	}
};
