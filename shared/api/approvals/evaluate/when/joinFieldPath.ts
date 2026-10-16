export const joinFieldPath = ({ path, key }: { path: string; key: string }) =>
	path ? `${path}.${key}` : key;
