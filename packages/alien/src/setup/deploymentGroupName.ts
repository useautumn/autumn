const MAX_GROUP_NAME_LENGTH = 100;
const NON_NAME_CHARACTERS = /[^a-z0-9]+/g;
const EDGE_HYPHENS = /^-+|-+$/g;

/** alien names are lowercase letters, digits and single hyphens, never starting `dg-`. */
export const toDeploymentGroupName = ({ label }: { label: string }): string => {
	const name = label
		.toLowerCase()
		.replace(NON_NAME_CHARACTERS, "-")
		.replace(EDGE_HYPHENS, "")
		.slice(0, MAX_GROUP_NAME_LENGTH)
		.replace(EDGE_HYPHENS, "");
	const collidesWithGroupIds = name.startsWith("dg-");
	return collidesWithGroupIds ? `group-${name}` : name;
};
