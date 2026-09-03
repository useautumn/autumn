/**
 * Copied verbatim into the CLI by the generator, so this file imports nothing:
 * the rule vocabulary and what each rule means live together here on purpose.
 *
 * Linting locally, before any network call, is what lets a config report every
 * problem at once — a round trip per mistake is what makes one painful to write.
 */

export type LintIssue = { path: string; message: string };

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

/** Every one of these is a zod call that survived into the spec. */
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

/** Rules the spec cannot express. Data, never predicates: they are serialised. */
export type LintRule = {
	readonly kind: "requiredWhen";
	readonly when: string;
	readonly equals: string;
	readonly require: readonly string[];
	readonly because: string;
};

/** The part of a node's rules that an anyOf/oneOf branch can override. */
export type ShapeRules = {
	readonly required?: readonly string[];
	readonly fields?: Readonly<Record<string, FieldConstraints>>;
};

export type NodeRules = ShapeRules & {
	/** How an entry is named in a breadcrumb; the key name when absent. */
	readonly label?: string;
	/** Field whose value names one entry, e.g. `featureId`. */
	readonly idField?: string;
	/** Record keys are user data; the spec constrains them via `propertyNames`. */
	readonly keys?: FieldConstraints;
	readonly rules?: readonly LintRule[];
	/** anyOf/oneOf alternatives, chosen by the value of `on`. */
	readonly variants?: {
		readonly on: string;
		readonly byValue: Readonly<Record<string, ShapeRules>>;
		/** The branch(es) that do not name `on` at all. */
		readonly fallback?: ShapeRules;
	};
};

/** Keyed by fixture path with array indices elided — `features.creditSchema`. */
export type LintRules = Readonly<Record<string, NodeRules>>;

export type LintHints = {
	readonly recordPaths: ReadonlySet<string>;
	readonly frozenPaths: ReadonlySet<string>;
};

type Entry = Record<string, unknown>;

type Walk = {
	readonly rules: LintRules;
	readonly hints: LintHints;
	readonly issues: LintIssue[];
};

const isEntry = (value: unknown): value is Entry =>
	value !== null && typeof value === "object" && !Array.isArray(value);

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

const checkRule = ({
	entry,
	rule,
	at,
	issues,
}: {
	entry: Entry;
	rule: LintRule;
	at: string;
	issues: LintIssue[];
}): void => {
	if (entry[rule.when] !== rule.equals) return;
	for (const field of rule.require) {
		if (entry[field] !== undefined) continue;
		issues.push({
			path: at,
			message: `${field} is required when ${rule.when} is ${show(rule.equals)}. ${rule.because}`,
		});
	}
};

const checkEntry = ({
	entry,
	node,
	at,
	issues,
}: {
	entry: Entry;
	node: NodeRules;
	at: string;
	issues: LintIssue[];
}): void => {
	checkShape({ entry, shape: node, at, issues });
	if (node.variants) {
		checkVariants({ entry, variants: node.variants, at, issues });
	}
	for (const rule of node.rules ?? []) {
		checkRule({ entry, rule, at, issues });
	}
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

const walkEntry = ({
	entry,
	path,
	trail,
	walk,
}: {
	entry: Entry;
	path: string;
	trail: readonly string[];
	walk: Walk;
}): void => {
	const node = walk.rules[path];
	if (node) checkEntry({ entry, node, at: render(trail), issues: walk.issues });

	for (const [key, child] of Object.entries(entry)) {
		walkValue({
			value: child,
			path: path ? `${path}.${key}` : key,
			key,
			trail,
			walk,
		});
	}
};

/** Array indices are elided from the path, so one rule covers every element. */
const walkValue = ({
	value,
	path,
	key,
	trail,
	walk,
}: {
	value: unknown;
	path: string;
	key: string;
	trail: readonly string[];
	walk: Walk;
}): void => {
	if (walk.hints.frozenPaths.has(path)) return;

	if (Array.isArray(value)) {
		const node = walk.rules[path];
		for (const [index, entry] of value.entries()) {
			if (!isEntry(entry)) continue;
			walkEntry({
				entry,
				path,
				trail: [...trail, crumbFor({ node, key, entry, index })],
				walk,
			});
		}
		return;
	}

	if (!isEntry(value)) return;

	// A record's keys are the user's, checked against `propertyNames`; its
	// values are still ours, one level down at `path.*`.
	if (walk.hints.recordPaths.has(path)) {
		const keys = walk.rules[path]?.keys;
		for (const [recordKey, child] of Object.entries(value)) {
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
			});
		}
		return;
	}

	walkEntry({ entry: value, path, trail: [...trail, key], walk });
};

/** Every issue in the document, in document order. */
export const lintDocument = ({
	document,
	rules,
	hints,
}: {
	document: Record<string, unknown>;
	rules: LintRules;
	hints: LintHints;
}): LintIssue[] => {
	const walk: Walk = { rules, hints, issues: [] };
	walkEntry({ entry: document, path: "", trail: [], walk });
	return walk.issues;
};
