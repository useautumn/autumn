export const getConnectedOrgSlug = ({
	orgSlug,
	masterOrgId,
}: {
	orgSlug: string;
	masterOrgId: string;
}) => {
	return `${orgSlug}|${masterOrgId}`;
};
