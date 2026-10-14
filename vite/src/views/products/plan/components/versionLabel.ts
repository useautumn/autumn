export const defaultVersionSlug = ({ version }: { version: number }) =>
	`v${version}`;

export const versionLabel = ({
	versionSlug,
	version,
}: {
	versionSlug?: string | null;
	version: number;
}) => versionSlug || defaultVersionSlug({ version });
