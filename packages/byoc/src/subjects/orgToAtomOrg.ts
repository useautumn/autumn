import type { Organization, SharedContext } from "@autumn/shared";

export const orgToAtomOrg = ({
	org,
}: {
	org: Organization;
}): SharedContext["org"] => ({
	config: org.config,
	default_currency: org.default_currency,
});
