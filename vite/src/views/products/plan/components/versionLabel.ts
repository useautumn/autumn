/** The slug the server stamps on a version row that has none of its own. */
export const defaultVersionSlug = ({ version }: { version: number }) =>
	`v${version}`;

/** A version row's display slug, falling back to the server default. */
export const versionLabel = ({
	versionSlug,
	version,
}: {
	versionSlug?: string | null;
	version: number;
}) => versionSlug || defaultVersionSlug({ version });
