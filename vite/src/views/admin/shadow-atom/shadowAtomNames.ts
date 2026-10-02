import type { ShadowAtomNames } from "./shadowAtomTypes";

export const NO_SHADOW_ATOM_NAMES: ShadowAtomNames = { orgsById: {} };

/** An org as the table shows it: its name, then slug; the bare id until its name loads. */
export const orgLabel = ({
	names,
	orgId,
}: {
	names: ShadowAtomNames;
	orgId: string;
}) => {
	const org = names.orgsById[orgId];
	if (!org) return { title: orgId, subtitle: orgId };
	return { title: org.name || orgId, subtitle: org.slug || orgId };
};
