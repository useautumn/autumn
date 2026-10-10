import type { Organization, SharedContext } from "@autumn/shared";

/** The org's settings and default currency, which is all a check or its response reads: an Atom never holds the org row. */
export const orgToAtomOrg = ({
	org,
}: {
	org: Organization;
}): SharedContext["org"] => ({
	config: org.config,
	default_currency: org.default_currency,
});
