export type MappingIdentity = {
	readonly responseField: string;
	readonly components: readonly {
		readonly paths: readonly string[];
		readonly default: string | number;
		readonly defaultWhen?: {
			readonly component: number;
			readonly value: string | number;
		};
	}[];
};

export type MappingProjection = {
	readonly mapping?: boolean;
	readonly sourcePath?: readonly string[];
	readonly properties?: Readonly<Record<string, MappingProjection>>;
	readonly items?: MappingProjection;
	readonly identity?: MappingIdentity;
};

export type MappingAssignment = {
	path: (string | number)[];
	text: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const valueAt = ({
	value,
	path,
}: {
	value: unknown;
	path: readonly string[];
}): unknown => {
	for (const key of path) {
		if (typeof value === "symbol") return value;
		value = isRecord(value) ? value[key] : undefined;
	}
	return value;
};

export const mappingIdentityOf = ({
	value,
	identity,
}: {
	value: unknown;
	identity: MappingIdentity;
}): string | undefined => {
	const values: (string | number)[] = [];
	for (const component of identity.components) {
		let selected: unknown;
		for (const path of component.paths) {
			selected = valueAt({ value, path: path.split(".") });
			if (selected !== undefined && selected !== null) break;
		}
		if (selected === undefined || selected === null) {
			selected =
				component.defaultWhen && values[component.defaultWhen.component]
					? component.defaultWhen.value
					: component.default;
		}
		if (typeof selected !== "string" && typeof selected !== "number")
			return undefined;
		values.push(selected);
	}
	return JSON.stringify(values);
};

const hasMappings = ({
	node,
	value,
	local = false,
}: {
	node: MappingProjection;
	value: unknown;
	local?: boolean;
}): boolean => {
	if (value === undefined || value === null) return false;
	if (node.mapping) return true;
	const items = node.items;
	if (items)
		return (
			Array.isArray(value) &&
			value.some((entry) => hasMappings({ node: items, value: entry, local }))
		);
	return Object.entries(node.properties ?? {}).some(([key, child]) =>
		hasMappings({
			node: child,
			value: valueAt({
				value,
				path: local ? [key] : (child.sourcePath ?? [key]),
			}),
			local,
		}),
	);
};

export const mappingAssignments = ({
	projection,
	local,
	remote,
}: {
	projection: MappingProjection;
	local: unknown;
	remote: unknown;
}): { assignments: MappingAssignment[]; errors: string[] } => {
	const assignments: MappingAssignment[] = [];
	const errors: string[] = [];
	const visit = ({
		node,
		localValue,
		remoteValue,
		path,
	}: {
		node: MappingProjection;
		localValue: unknown;
		remoteValue: unknown;
		path: (string | number)[];
	}): void => {
		if (node.mapping) {
			if (remoteValue === undefined || remoteValue === null) {
				if (localValue !== undefined) assignments.push({ path, text: null });
				return;
			}
			assignments.push({ path, text: JSON.stringify(remoteValue) });
			return;
		}
		if (
			!hasMappings({ node, value: remoteValue }) &&
			!hasMappings({ node, value: localValue, local: true })
		)
			return;
		if (remoteValue === undefined || remoteValue === null) return;
		if (typeof localValue === "symbol") {
			errors.push(`${path.join(".")}: cannot address a computed value`);
			return;
		}
		if (localValue === undefined || localValue === null) {
			errors.push(
				`${path.join(".")}: mapping container is not stated in the fixture`,
			);
			return;
		}
		if (node.items) {
			if (
				!Array.isArray(localValue) ||
				!Array.isArray(remoteValue) ||
				!node.identity
			) {
				errors.push(`${path.join(".")}: array identity is unavailable`);
				return;
			}
			const identity = node.identity;
			const localKeys = localValue.map((value) =>
				mappingIdentityOf({ value, identity }),
			);
			const remoteKeys = remoteValue.map((value) =>
				valueAt({ value, path: identity.responseField.split(".") }),
			);
			for (const [index, value] of localValue.entries()) {
				const key = localKeys[index];
				const matches = remoteKeys.flatMap((candidate, position) =>
					candidate === key ? [position] : [],
				);
				const match = matches[0];
				if (
					key === undefined ||
					match === undefined ||
					localKeys.filter((candidate) => candidate === key).length !== 1 ||
					matches.length !== 1
				) {
					errors.push(
						`${[...path, index].join(".")}: no unique server identity match`,
					);
					continue;
				}
				visit({
					node: node.items,
					localValue: value,
					remoteValue: remoteValue[match],
					path: [...path, index],
				});
			}
			return;
		}
		for (const [key, child] of Object.entries(node.properties ?? {})) {
			visit({
				node: child,
				localValue: valueAt({ value: localValue, path: [key] }),
				remoteValue: valueAt({
					value: remoteValue,
					path: child.sourcePath ?? [key],
				}),
				path: [...path, key],
			});
		}
	};
	visit({ node: projection, localValue: local, remoteValue: remote, path: [] });
	return { assignments, errors };
};
