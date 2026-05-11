export const buildPrepareModuleKey = ({
	kind,
	parts,
}: {
	kind: string;
	parts: string[];
}) => [kind, ...parts].join(":");
