import type { ShadowAtomNames } from "./shadowAtomTypes";

export const NO_SHADOW_ATOM_NAMES: ShadowAtomNames = {
	orgsById: {},
	customerNamesByOrgId: {},
};

/** An org as a list shows it: its name, then slug and id; the bare id until its name loads. */
export const orgLabel = ({
	names,
	orgId,
}: {
	names: ShadowAtomNames;
	orgId: string;
}) => {
	const org = names.orgsById[orgId];
	if (!org) return { title: orgId, subtitle: orgId };
	return {
		title: org.name || orgId,
		subtitle: org.slug ? `${org.slug} · ${orgId}` : orgId,
	};
};

export const customerLabel = ({
	names,
	orgId,
	customerId,
}: {
	names: ShadowAtomNames;
	orgId: string;
	customerId: string;
}) => {
	const customer = names.customerNamesByOrgId[orgId]?.[customerId];
	return {
		title: customer?.name || customer?.email || customerId,
		subtitle: customer?.email
			? `${customer.email} · ${customerId}`
			: customerId,
	};
};
