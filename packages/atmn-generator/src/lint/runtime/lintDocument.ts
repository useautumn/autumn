export type LintIssue = { path: string; message: string; warning?: true };

export class ConfigError extends Error {
	readonly issues: LintIssue[];

	constructor(issues: LintIssue[]) {
		super(
			[
				`${issues.length} problem${issues.length === 1 ? "" : "s"} in your config:`,
				"",
				...issues.map((issue) => `  ${issue.path}\n    ${issue.message}`),
			].join("\n"),
		);
		this.name = "ConfigError";
		this.issues = issues;
	}
}

export type FieldConstraints = {
	readonly enum?: readonly unknown[];
	readonly minimum?: number;
	readonly maximum?: number;
	readonly exclusiveMinimum?: number;
	readonly exclusiveMaximum?: number;
	readonly minLength?: number;
	readonly maxLength?: number;
	readonly minItems?: number;
	readonly maxItems?: number;
	readonly pattern?: string;
};

export type LintRule =
	| {
			readonly kind: "requiredWhen";
			readonly when: string;
			readonly equals: string;
			readonly require: readonly string[];
			readonly because: string;
	  }
	| {
			readonly kind: "forbiddenWhen";
			readonly when: string;
			readonly equals: string;
			readonly forbid: readonly string[];
			readonly because: string;
	  }
	| {
			readonly kind: "mutex";
			readonly fields: readonly string[];
			readonly because: string;
	  }
	| {
			readonly kind: "exactlyOne";
			readonly fields: readonly string[];
			readonly because: string;
	  }
	| {
			readonly kind: "unique";
			readonly field: string | readonly string[];
			readonly alongside?: string;
			readonly absentMeans?: string;
			readonly asEnvName?: true;
			readonly because: string;
	  }
	| {
			readonly kind: "linkedOnce";
			readonly groupBy: string;
			readonly namedBy: string;
			readonly absentMeans: string;
			readonly collection: string;
			readonly identity: string;
			readonly pins: readonly string[];
			readonly because: string;
	  }
	| {
			readonly kind: "exactlyOneActive";
			readonly groupBy: string;
			readonly field: string;
			readonly label: string;
			readonly because: string;
	  }
	| {
			readonly kind: "exists";
			readonly field: string;
			readonly in: string;
			readonly matching: string | readonly string[];
			readonly because: string;
	  }
	| {
			readonly kind: "nonEmpty";
			readonly field: string;
			readonly warning?: true;
			readonly because: string;
	  }
	| {
			readonly kind: "knownValues";
			readonly field: string;
			readonly values: readonly string[];
			readonly warning?: true;
			readonly because: string;
	  }
	| {
			readonly kind: "notMap";
			readonly field: string;
			readonly because: string;
	  }
	| {
			readonly kind: "uniformPrefix";
			readonly field: string;
			readonly prefix: string;
			readonly because: string;
	  }
	| {
			readonly kind: "rejects";
			readonly field: string;
			readonly check: string;
			readonly because: string;
	  }
	| {
			readonly kind: "compare";
			readonly field: string;
			readonly op: "<" | "<=" | ">" | ">=";
			readonly than: string;
			readonly because: string;
	  }
	| {
			readonly kind: "valueWhen";
			readonly when: string;
			readonly equals: string;
			readonly field: string;
			readonly mustBe: string;
			readonly because: string;
	  }
	| {
			readonly kind: "targetHas";
			readonly when: string;
			readonly field: string;
			readonly in: string;
			readonly matching: string;
			readonly target: string;
			readonly equals: string;
			readonly because: string;
	  }
	| {
			readonly kind: "refusedWhen";
			readonly whenEquals: Readonly<Record<string, string>>;
			readonly whenStated: readonly string[];
			readonly whenUnstated: readonly string[];
			readonly because: string;
	  }
	| {
			readonly kind: "targetForbids";
			readonly field: string;
			readonly in: string;
			readonly matching: string;
			readonly target: string;
			readonly equals: string | boolean;
			readonly whenEquals: Readonly<Record<string, string>>;
			readonly whenStated: readonly string[];
			readonly whenAnyStated?: readonly string[];
			readonly whenUnstated: readonly string[];
			readonly because: string;
	  }
	| {
			readonly kind: "targetLacks";
			readonly field: string;
			readonly in: string;
			readonly matching: string;
			readonly target: string;
			readonly label: string;
			readonly parentGuard: string;
			readonly parentIdField: string;
			readonly parentLabel: string;
			readonly because: string;
	  };

export type ShapeRules = {
	readonly required?: readonly string[];
	readonly hidden?: readonly string[];
	readonly fields?: Readonly<Record<string, FieldConstraints>>;
};

export type NodeRules = ShapeRules & {
	readonly label?: string;
	readonly idField?: string;
	readonly keys?: FieldConstraints;
	readonly values?: FieldConstraints;
	readonly rules?: readonly LintRule[];
	readonly variants?: {
		readonly on: string;
		readonly byValue: Readonly<Record<string, ShapeRules>>;
		readonly fallback?: ShapeRules;
	};
};

export type LintRules = Readonly<Record<string, NodeRules>>;

export type LintChecks = Readonly<Record<string, (value: string) => boolean>>;

export type LintHints = {
	readonly recordPaths: ReadonlySet<string>;
	readonly frozenPaths: ReadonlySet<string>;
};

type Entry = Record<string, unknown>;

type Walk = {
	readonly document: Entry;
	readonly rules: LintRules;
	readonly hints: LintHints;
	readonly checks: LintChecks;
	readonly issues: LintIssue[];
};

const isEntry = (value: unknown): value is Entry =>
	value !== null && typeof value === "object" && !Array.isArray(value);

const valueAtPath = ({
	entry,
	path,
}: {
	entry: Entry;
	path: string;
}): unknown => {
	let current: unknown = entry;
	for (const segment of path.split(".")) {
		if (Array.isArray(current)) {
			current = current[Number(segment)];
			continue;
		}
		if (!isEntry(current)) return undefined;
		current = current[segment];
	}
	return current;
};

const firstValueAtPaths = ({
	entry,
	paths,
}: {
	entry: Entry;
	paths: string | readonly string[];
}): unknown => {
	for (const path of typeof paths === "string" ? [paths] : paths) {
		const value = valueAtPath({ entry, path });
		if (value !== undefined) return value;
	}
	return undefined;
};

const show = (value: unknown): string => JSON.stringify(value);

const list = (values: readonly unknown[]): string =>
	values.map(show).join(", ");

const regexCache = new Map<string, RegExp>();
const regexFor = (pattern: string): RegExp => {
	const cached = regexCache.get(pattern);
	if (cached) return cached;
	const compiled = new RegExp(pattern);
	regexCache.set(pattern, compiled);
	return compiled;
};

const constraintFailures = ({
	name,
	value,
	constraints,
}: {
	name: string;
	value: unknown;
	constraints: FieldConstraints;
}): string[] => {
	const failures: string[] = [];
	const c = constraints;

	if (c.enum && !c.enum.includes(value)) {
		failures.push(
			`${name} must be one of ${list(c.enum)} — got ${show(value)}.`,
		);
	}

	if (typeof value === "number") {
		if (c.minimum !== undefined && value < c.minimum)
			failures.push(`${name} must be at least ${c.minimum} — got ${value}.`);
		if (c.maximum !== undefined && value > c.maximum)
			failures.push(`${name} must be at most ${c.maximum} — got ${value}.`);
		if (c.exclusiveMinimum !== undefined && value <= c.exclusiveMinimum)
			failures.push(
				`${name} must be greater than ${c.exclusiveMinimum} — got ${value}.`,
			);
		if (c.exclusiveMaximum !== undefined && value >= c.exclusiveMaximum)
			failures.push(
				`${name} must be less than ${c.exclusiveMaximum} — got ${value}.`,
			);
	}

	if (typeof value === "string") {
		if (c.minLength !== undefined && value.length < c.minLength) {
			failures.push(
				c.minLength === 1
					? `${name} must not be empty.`
					: `${name} must be at least ${c.minLength} characters — got ${value.length}.`,
			);
		}
		if (c.maxLength !== undefined && value.length > c.maxLength)
			failures.push(
				`${name} must be at most ${c.maxLength} characters — got ${value.length}.`,
			);
		if (c.pattern !== undefined && !regexFor(c.pattern).test(value))
			failures.push(`${name} must match ${c.pattern} — got ${show(value)}.`);
	}

	if (Array.isArray(value)) {
		if (c.minItems !== undefined && value.length < c.minItems)
			failures.push(
				`${name} must have at least ${c.minItems} ${c.minItems === 1 ? "entry" : "entries"}.`,
			);
		if (c.maxItems !== undefined && value.length > c.maxItems)
			failures.push(`${name} must have at most ${c.maxItems} entries.`);
	}

	return failures;
};

const checkShape = ({
	entry,
	shape,
	at,
	issues,
}: {
	entry: Entry;
	shape: ShapeRules;
	at: string;
	issues: LintIssue[];
}): void => {
	for (const field of shape.required ?? []) {
		if (entry[field] === undefined)
			issues.push({ path: at, message: `${field} is required.` });
	}
	for (const field of shape.hidden ?? []) {
		if (entry[field] !== undefined)
			issues.push({
				path: at,
				message: `${field} is not a config field. Remove it.`,
			});
	}
	for (const [field, constraints] of Object.entries(shape.fields ?? {})) {
		if (entry[field] === undefined) continue;
		for (const message of constraintFailures({
			name: field,
			value: entry[field],
			constraints,
		})) {
			issues.push({ path: at, message });
		}
	}
};

const checkVariants = ({
	entry,
	variants,
	at,
	issues,
}: {
	entry: Entry;
	variants: NonNullable<NodeRules["variants"]>;
	at: string;
	issues: LintIssue[];
}): void => {
	const selector = entry[variants.on];
	if (selector === undefined) {
		if (variants.fallback) {
			checkShape({ entry, shape: variants.fallback, at, issues });
		} else {
			issues.push({ path: at, message: `${variants.on} is required.` });
		}
		return;
	}
	const chosen =
		typeof selector === "string" ? variants.byValue[selector] : undefined;
	if (!chosen) {
		issues.push({
			path: at,
			message: `${variants.on} must be one of ${list(Object.keys(variants.byValue))} — got ${show(selector)}.`,
		});
		return;
	}
	checkShape({ entry, shape: chosen, at, issues });
};

const crumbFor = ({
	node,
	key,
	entry,
	index,
}: {
	node: NodeRules | undefined;
	key: string;
	entry: Entry;
	index: number;
}): string => {
	const label = node?.label ?? key;
	const id = node?.idField ? entry[node.idField] : undefined;
	return typeof id === "string" && id
		? `${label} ${show(id)}`
		: `${label}[${index}]`;
};

const render = (trail: readonly string[]): string =>
	trail.length === 0 ? "config" : trail.join(" › ");

const setFields = ({
	entry,
	fields,
}: {
	entry: Entry;
	fields: readonly string[];
}): string[] => fields.filter((field) => entry[field] !== undefined);

const joinNames = (names: readonly string[]): string =>
	names.length <= 1
		? names.join("")
		: `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

const COMPARE = {
	"<": { holds: (a: number, b: number) => a < b, words: "less than" },
	"<=": { holds: (a: number, b: number) => a <= b, words: "at most" },
	">": { holds: (a: number, b: number) => a > b, words: "greater than" },
	">=": { holds: (a: number, b: number) => a >= b, words: "at least" },
} as const;

const entryMatchesWhen = ({
	entry,
	rule,
}: {
	entry: Entry;
	rule: Extract<LintRule, { kind: "refusedWhen" | "targetForbids" }>;
}): boolean => {
	const isStatedValue = (value: unknown) =>
		value !== undefined && value !== null && value !== 0 && value !== false;
	const isStated = (path: string): boolean => {
		const [head, tail] = path.split(".*.");
		if (tail === undefined) return isStatedValue(valueAtPath({ entry, path }));
		const list = valueAtPath({ entry, path: head as string });
		return (
			Array.isArray(list) &&
			list.some((element) => isEntry(element) && isStatedValue(element[tail]))
		);
	};
	const anyStated =
		"whenAnyStated" in rule && rule.whenAnyStated
			? rule.whenAnyStated.some(isStated)
			: true;
	return (
		Object.entries(rule.whenEquals).every(
			([path, value]) => valueAtPath({ entry, path }) === value,
		) &&
		rule.whenStated.every(isStated) &&
		anyStated &&
		!rule.whenUnstated.some(isStated)
	);
};

const entryRuleFailures = ({
	entry,
	rule,
	document,
	parent,
	checks,
}: {
	entry: Entry;
	rule: LintRule;
	document: Entry;
	parent?: Entry;
	checks: LintChecks;
}): string[] => {
	switch (rule.kind) {
		case "requiredWhen": {
			if (entry[rule.when] !== rule.equals) return [];
			return rule.require
				.filter((field) => entry[field] === undefined)
				.map(
					(field) =>
						`${field} is required when ${rule.when} is ${show(rule.equals)}. ${rule.because}`,
				);
		}
		case "forbiddenWhen": {
			if (entry[rule.when] !== rule.equals) return [];
			return setFields({ entry, fields: rule.forbid }).map(
				(field) =>
					`${field} cannot be set when ${rule.when} is ${show(rule.equals)}. ${rule.because}`,
			);
		}
		case "mutex": {
			const set = setFields({ entry, fields: rule.fields });
			if (set.length <= 1) return [];
			return [`${joinNames(set)} cannot be set together. ${rule.because}`];
		}
		case "exactlyOne": {
			const set = setFields({ entry, fields: rule.fields });
			if (set.length === 1) return [];
			if (set.length === 0)
				return [
					`One of ${joinNames(rule.fields)} is required. ${rule.because}`,
				];
			return [`${joinNames(set)} cannot be set together. ${rule.because}`];
		}
		case "exists": {
			const value = valueAtPath({ entry, path: rule.field });
			const target = document[rule.in];
			if (value === undefined || value === null || !Array.isArray(target))
				return [];
			const names = (wanted: unknown): boolean =>
				target.some(
					(candidate) =>
						isEntry(candidate) &&
						firstValueAtPaths({ entry: candidate, paths: rule.matching }) ===
							wanted,
				);
			const missing = (Array.isArray(value) ? value : [value]).filter(
				(wanted) => !names(wanted),
			);
			return missing.map(
				(wanted) =>
					`${rule.field} ${show(wanted)} is not in ${rule.in}. ${rule.because}`,
			);
		}
		case "nonEmpty": {
			const value = entry[rule.field];
			const empty = Array.isArray(value)
				? value.length === 0
				: isEntry(value) && Object.keys(value).length === 0;
			return empty ? [`${rule.field} is empty. ${rule.because}`] : [];
		}
		case "knownValues": {
			const value = entry[rule.field];
			if (!Array.isArray(value)) return [];
			return value
				.filter(
					(item): item is string =>
						typeof item === "string" && !rule.values.includes(item),
				)
				.map((item) => `\`${item}\` ${rule.because}`);
		}
		case "notMap": {
			const value = entry[rule.field];
			return isEntry(value) ? [`${rule.field} is a map. ${rule.because}`] : [];
		}
		case "uniformPrefix": {
			const value = entry[rule.field];
			if (!Array.isArray(value)) return [];
			const prefixed = value.filter(
				(item) => typeof item === "string" && item.startsWith(rule.prefix),
			).length;
			return prefixed === 0 || prefixed === value.length ? [] : [rule.because];
		}
		case "rejects": {
			const value = entry[rule.field];
			const check = checks[rule.check];
			if (check === undefined) return [];
			const stated =
				typeof value === "string"
					? [value]
					: isEntry(value)
						? Object.values(value).filter(
								(item): item is string => typeof item === "string",
							)
						: [];
			return stated
				.filter((item) => check(item))
				.map(
					(item) => `${rule.field} ${show(item)} is refused. ${rule.because}`,
				);
		}
		case "compare": {
			const a = entry[rule.field];
			const b = entry[rule.than];
			if (typeof a !== "number" || typeof b !== "number") return [];
			const { holds, words } = COMPARE[rule.op];
			return holds(a, b)
				? []
				: [
						`${rule.field} must be ${words} ${rule.than} — got ${a} and ${b}. ${rule.because}`,
					];
		}
		case "valueWhen": {
			if (entry[rule.when] !== rule.equals) return [];
			const value = entry[rule.field];
			if (value === undefined || value === rule.mustBe) return [];
			return [
				`${rule.field} must be ${show(rule.mustBe)} when ${rule.when} is ${show(rule.equals)}. ${rule.because}`,
			];
		}
		case "targetHas": {
			if (entry[rule.when] === undefined) return [];
			const target = document[rule.in];
			if (!Array.isArray(target)) return [];
			const row = target.find(
				(candidate) =>
					isEntry(candidate) && candidate[rule.matching] === entry[rule.field],
			);
			if (!row || row[rule.target] === rule.equals) return [];
			return [
				`${rule.when} needs ${rule.in} ${show(entry[rule.field])} to have ${rule.target} ${show(rule.equals)} — got ${show(row[rule.target])}. ${rule.because}`,
			];
		}
		case "targetLacks": {
			const target = document[rule.in];
			if (!Array.isArray(target)) return [];
			const row = target.find(
				(candidate) =>
					isEntry(candidate) && candidate[rule.matching] === entry[rule.field],
			);
			if (!row || row[rule.target] !== true) return [];
			if (parent?.[rule.parentGuard] === true) return [];
			return [
				`${rule.label} ${show(entry[rule.field])} is ${rule.target}. Unarchive it, or archive ${rule.parentLabel} ${show(parent?.[rule.parentIdField])}. ${rule.because}`,
			];
		}
		case "refusedWhen":
			return entryMatchesWhen({ entry, rule }) ? [rule.because] : [];
		case "targetForbids": {
			if (!entryMatchesWhen({ entry, rule })) return [];
			const target = document[rule.in];
			if (!Array.isArray(target)) return [];
			const row = target.find(
				(candidate) =>
					isEntry(candidate) && candidate[rule.matching] === entry[rule.field],
			);
			if (!row || row[rule.target] !== rule.equals) return [];
			return [
				`${rule.in} ${show(entry[rule.field])} has ${rule.target} ${show(rule.equals)}, so this is refused. ${rule.because}`,
			];
		}
		case "unique":
		case "linkedOnce":
		case "exactlyOneActive":
			return [];
	}
};

type CollectionCheck<K extends LintRule["kind"]> = {
	entries: unknown[];
	rule: Extract<LintRule, { kind: K }>;
	node: NodeRules;
	key: string;
	trail: readonly string[];
	issues: LintIssue[];
};

const checkUnique = ({
	entries,
	rule,
	node,
	key,
	trail,
	issues,
}: CollectionCheck<"unique">): void => {
	const seen = new Map<string, string>();
	for (const [index, entry] of entries.entries()) {
		if (!isEntry(entry)) continue;
		const value = firstValueAtPaths({ entry, paths: rule.field });
		if (typeof value !== "string") continue;
		const fieldName =
			typeof rule.field === "string" ? rule.field : rule.field.join(" / ");
		const pair =
			rule.alongside === undefined ? undefined : entry[rule.alongside];
		if (rule.alongside !== undefined && typeof pair !== "string") continue;
		const normalized = rule.asEnvName
			? value.toUpperCase().replace(/-/g, "_")
			: value;
		const composite =
			rule.alongside === undefined ? normalized : `${normalized}@${pair}`;
		const first = seen.get(composite);
		if (rule.asEnvName && first !== undefined) {
			if (first !== value)
				issues.push({
					path: render([...trail, crumbFor({ node, key, entry, index })]),
					message: `${fieldName} ${show(value)} and ${show(first)} both read as ${normalized} in an env var name. ${rule.because}`,
				});
			continue;
		}
		if (first !== undefined) {
			const label =
				rule.alongside === undefined
					? `${fieldName} ${show(value)}`
					: `${fieldName} ${show(value)} with ${rule.alongside} ${show(pair)}`;
			issues.push({
				path: render([...trail, crumbFor({ node, key, entry, index })]),
				message: `${label} is used more than once. ${rule.because}`,
			});
		}
		seen.set(composite, value);
	}
};

type Pin = { key: string; display: string };

const pinOf = ({
	entry,
	pins,
}: {
	entry: Entry;
	pins: readonly string[];
}): Pin | undefined => {
	for (const pin of pins) {
		const value = entry[pin];
		if (typeof value === "string")
			return { key: `${pin}:${value}`, display: value };
		if (typeof value === "number")
			return { key: `${pin}:${value}`, display: `v${value}` };
	}
	return undefined;
};

const checkLinkedOnce = ({
	entries,
	rule,
	node,
	key,
	trail,
	issues,
}: CollectionCheck<"linkedOnce">): void => {
	const ownerByLink = new Map<string, { owner: string; index: number }>();
	for (const [index, entry] of entries.entries()) {
		if (!isEntry(entry)) continue;
		const group = entry[rule.groupBy];
		const links = entry[rule.collection];
		if (typeof group !== "string" || !Array.isArray(links)) continue;
		const owner =
			pinOf({ entry, pins: [rule.namedBy] })?.display ?? rule.absentMeans;

		for (const link of links) {
			if (!isEntry(link)) continue;
			const id = link[rule.identity];
			if (typeof id !== "string") continue;
			const pin = pinOf({ entry: link, pins: rule.pins });
			const label = pin === undefined ? id : `${id} ${pin.display}`;
			const composite = `${group} ${id} ${pin?.key ?? "latest"}`;
			const previous = ownerByLink.get(composite);
			if (previous === undefined) {
				ownerByLink.set(composite, { owner, index });
				continue;
			}
			const at = render([...trail, crumbFor({ node, key, entry, index })]);
			if (previous.index === index) {
				issues.push({
					path: at,
					message: `${label} is linked twice from ${group} ${owner}. ${rule.because}`,
				});
				continue;
			}
			if (previous.owner === owner) continue;
			issues.push({
				path: at,
				message: `${label} is linked from ${group} ${previous.owner} and ${group} ${owner}. ${rule.because}`,
			});
		}
	}
};

const checkExactlyOneActive = ({
	entries,
	rule,
	node,
	key,
	trail,
	issues,
}: CollectionCheck<"exactlyOneActive">): void => {
	type Member = { entry: Entry; index: number; active: boolean };
	const rowsByGroup = new Map<string, Member[]>();
	for (const [index, entry] of entries.entries()) {
		if (!isEntry(entry)) continue;
		const group = entry[rule.groupBy];
		if (typeof group !== "string") continue;
		rowsByGroup.set(group, [
			...(rowsByGroup.get(group) ?? []),
			{ entry, index, active: entry[rule.field] === true },
		]);
	}
	for (const [group, members] of rowsByGroup) {
		const active = members.filter((member) => member.active);
		if (active.length === 1) continue;
		const at = active.length === 0 ? members[0] : active[1];
		if (at === undefined) continue;
		const versions = `${members.length} version${members.length === 1 ? "" : "s"}`;
		const count =
			active.length === 0 ? "none is active" : `${active.length} are active`;
		issues.push({
			path: render([
				...trail,
				crumbFor({ node, key, entry: at.entry, index: at.index }),
			]),
			message: `${rule.label} ${show(group)} has ${versions} and ${count}. ${rule.because}${renameHint({ active, members })}`,
		});
	}
};

const renameHint = <T extends { active: boolean; entry: Entry }>({
	active,
	members,
}: {
	active: T[];
	members: T[];
}): string => {
	if (active.length !== 0) return "";
	const everyRowIsKnown = members.every(
		(member) => typeof member.entry.internalId === "string",
	);
	if (!everyRowIsKnown) return "";
	return " If you are renaming a plan, change the planId on every one of its versions, not just some.";
};

const checkCollection = ({
	entries,
	node,
	key,
	trail,
	issues,
}: {
	entries: unknown[];
	node: NodeRules;
	key: string;
	trail: readonly string[];
	issues: LintIssue[];
}): void => {
	for (const rule of node.rules ?? []) {
		if (rule.kind === "unique")
			checkUnique({ entries, rule, node, key, trail, issues });
		if (rule.kind === "linkedOnce")
			checkLinkedOnce({ entries, rule, node, key, trail, issues });
		if (rule.kind === "exactlyOneActive")
			checkExactlyOneActive({ entries, rule, node, key, trail, issues });
	}
};

const checkEntry = ({
	entry,
	node,
	at,
	walk,
	parent,
}: {
	entry: Entry;
	node: NodeRules;
	at: string;
	walk: Walk;
	parent?: Entry;
}): void => {
	checkShape({ entry, shape: node, at, issues: walk.issues });
	if (node.variants) {
		checkVariants({ entry, variants: node.variants, at, issues: walk.issues });
	}
	for (const rule of node.rules ?? []) {
		const warning = "warning" in rule && rule.warning === true;
		for (const message of entryRuleFailures({
			entry,
			rule,
			document: walk.document,
			parent,
			checks: walk.checks,
		})) {
			walk.issues.push({ path: at, message, ...(warning ? { warning } : {}) });
		}
	}
};

const walkEntry = ({
	entry,
	path,
	trail,
	walk,
	parent,
}: {
	entry: Entry;
	path: string;
	trail: readonly string[];
	walk: Walk;
	parent?: Entry;
}): void => {
	const node = walk.rules[path];
	if (node) checkEntry({ entry, node, at: render(trail), walk, parent });

	for (const [key, child] of Object.entries(entry)) {
		walkValue({
			value: child,
			path: path ? `${path}.${key}` : key,
			key,
			trail,
			walk,
			parent: entry,
		});
	}
};

const walkValue = ({
	value,
	path,
	key,
	trail,
	walk,
	parent,
}: {
	value: unknown;
	path: string;
	key: string;
	trail: readonly string[];
	walk: Walk;
	parent?: Entry;
}): void => {
	if (walk.hints.frozenPaths.has(path)) return;

	if (Array.isArray(value)) {
		const node = walk.rules[path];
		if (node) {
			checkCollection({
				entries: value,
				node,
				key,
				trail,
				issues: walk.issues,
			});
		}
		for (const [index, entry] of value.entries()) {
			if (!isEntry(entry)) continue;
			walkEntry({
				entry,
				path,
				trail: [...trail, crumbFor({ node, key, entry, index })],
				walk,
				parent,
			});
		}
		return;
	}

	if (!isEntry(value)) return;

	if (walk.hints.recordPaths.has(path)) {
		const keys = walk.rules[path]?.keys;
		const values = walk.rules[path]?.values;
		for (const [recordKey, child] of Object.entries(value)) {
			if (values && !isEntry(child) && !Array.isArray(child)) {
				for (const message of constraintFailures({
					name: `${key}.${recordKey}`,
					value: child,
					constraints: values,
				})) {
					walk.issues.push({ path: render(trail), message });
				}
			}
			if (keys) {
				for (const message of constraintFailures({
					name: `${key} key ${show(recordKey)}`,
					value: recordKey,
					constraints: keys,
				})) {
					walk.issues.push({ path: render(trail), message });
				}
			}
			walkValue({
				value: child,
				path: `${path}.*`,
				key: `${key}[${show(recordKey)}]`,
				trail,
				walk,
				parent,
			});
		}
		return;
	}

	walkEntry({ entry: value, path, trail: [...trail, key], walk, parent });
};

export const lintDocument = ({
	document,
	rules,
	hints,
	checks = {},
}: {
	document: Record<string, unknown>;
	rules: LintRules;
	hints: LintHints;
	checks?: LintChecks;
}): LintIssue[] => {
	const walk: Walk = { document, rules, hints, checks, issues: [] };
	walkEntry({ entry: document, path: "", trail: [], walk });
	return walk.issues;
};
