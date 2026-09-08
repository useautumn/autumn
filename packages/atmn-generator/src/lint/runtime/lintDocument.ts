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
			/** At most one of `fields` may be set. */
			readonly kind: "mutex";
			readonly fields: readonly string[];
			readonly because: string;
	  }
	| {
			/** Precisely one of `fields` must be set. */
			readonly kind: "exactlyOne";
			readonly fields: readonly string[];
			readonly because: string;
	  }
	| {
			/** No two entries of the collection share a value of `field`, paired
			 * with `alongside` when given (an absent `alongside` reads as `absentMeans`).
			 * A list of paths reads the first one the entry states, which is how a
			 * union item is named. */
			readonly kind: "unique";
			readonly field: string | readonly string[];
			readonly alongside?: string;
			readonly absentMeans?: string;
			readonly because: string;
	  }
	| {
			/** No two entries sharing `groupBy` may link the same entry of their
			 * own `collection`. A link is identified by `identity` plus the first
			 * `pins` field it states; the entries themselves are named by
			 * `namedBy`, reading as `absentMeans` when they state none. */
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
			/** Entries sharing `groupBy` are versions of one thing; once there is
			 * more than one, every one of them must state `slug`. With
			 * `collection`, the same holds for the nested rows named by `identity`
			 * across every entry's `collection`, where any of `pins` counts. */
			readonly kind: "versionSlugs";
			readonly groupBy: string;
			readonly slug: string;
			readonly label: string;
			readonly collection?: string;
			readonly identity?: string;
			readonly pins?: readonly string[];
			readonly because: string;
	  }
	| {
			/** `field` names an entry of top-level collection `in` by `matching`.
			 * An array-valued `field` is checked element-wise; a list of `matching`
			 * paths matches on whichever the candidate states. Skipped when that
			 * collection is absent: absent means "not mine". */
			readonly kind: "exists";
			readonly field: string;
			readonly in: string;
			readonly matching: string | readonly string[];
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
			/** `field` must equal `mustBe` when `when` is `equals`. */
			readonly kind: "valueWhen";
			readonly when: string;
			readonly equals: string;
			readonly field: string;
			readonly mustBe: string;
			readonly because: string;
	  }
	| {
			/** `field` names a row of top-level collection `in` by `matching`;
			 * that row's `target` must equal `equals`. Skipped when `when` is unset. */
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
			/** `field` names a row of top-level collection `in` by `matching`,
			 * shown in the message as `label`; that row's `target` must not be
			 * `true`. Skipped when the entry's own parent already has
			 * `parentGuard` true — an archived plan may reference whatever
			 * archived features it likes. `parentLabel`/`parentIdField` name
			 * that parent in the message. */
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
	readonly document: Entry;
	readonly rules: LintRules;
	readonly hints: LintHints;
	readonly issues: LintIssue[];
};

const isEntry = (value: unknown): value is Entry =>
	value !== null && typeof value === "object" && !Array.isArray(value);

/** Dotted lookup, so a rule can name a field inside a union branch. */
const valueAtPath = ({
	entry,
	path,
}: {
	entry: Entry;
	path: string;
}): unknown => {
	let current: unknown = entry;
	for (const segment of path.split(".")) {
		if (!isEntry(current)) return undefined;
		current = current[segment];
	}
	return current;
};

/** The first of `paths` the entry states — a union item is named by its branch. */
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

const entryRuleFailures = ({
	entry,
	rule,
	document,
	parent,
}: {
	entry: Entry;
	rule: LintRule;
	document: Entry;
	parent?: Entry;
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
		case "unique":
		case "linkedOnce":
		case "versionSlugs":
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
	const seen = new Set<string>();
	for (const [index, entry] of entries.entries()) {
		if (!isEntry(entry)) continue;
		const value = firstValueAtPaths({ entry, paths: rule.field });
		if (typeof value !== "string") continue;
		const fieldName =
			typeof rule.field === "string" ? rule.field : rule.field.join(" / ");
		const pair =
			rule.alongside === undefined
				? undefined
				: (entry[rule.alongside] ?? rule.absentMeans);
		const composite =
			rule.alongside === undefined ? value : `${value}@${String(pair)}`;
		if (seen.has(composite)) {
			const label =
				rule.alongside === undefined
					? `${fieldName} ${show(value)}`
					: `${fieldName} ${show(value)} with ${rule.alongside} ${show(pair)}`;
			issues.push({
				path: render([...trail, crumbFor({ node, key, entry, index })]),
				message: `${label} is used more than once. ${rule.because}`,
			});
		}
		seen.add(composite);
	}
};

/** A pin's identity and how it reads: `version: 1` and `versionSlug: "v1"`
 * both display as `v1` but can name different rows, so the field is part of
 * what the link is keyed by. */
type Pin = { key: string; display: string };

/** The first pin an entry states — what names the row it addresses. */
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
			// Nested collections have no unique rule of their own, so one entry
			// naming a row twice is this rule's to report.
			if (previous.index === index) {
				issues.push({
					path: at,
					message: `${label} is linked twice from ${group} ${owner}. ${rule.because}`,
				});
				continue;
			}
			// Two entries naming one version is the unique rule's error, not this one.
			if (previous.owner === owner) continue;
			issues.push({
				path: at,
				message: `${label} is linked from ${group} ${previous.owner} and ${group} ${owner}. ${rule.because}`,
			});
		}
	}
};

/** Once a thing has versions, a slug-less one no longer reads as "the v1". */
const checkVersionSlugs = ({
	entries,
	rule,
	node,
	key,
	trail,
	issues,
}: CollectionCheck<"versionSlugs">): void => {
	type Member = { entry: Entry; index: number; slugged: boolean };
	const statesSlug = (entry: Entry): boolean =>
		typeof entry[rule.slug] === "string";
	const report = ({
		members,
		subject,
	}: {
		members: Member[];
		subject: string;
	}): void => {
		const slugged = members.filter((member) => member.slugged).length;
		if (members.length <= 1 || slugged === members.length) return;
		const first = members.find((member) => !member.slugged);
		if (first === undefined) return;
		issues.push({
			path: render([
				...trail,
				crumbFor({ node, key, entry: first.entry, index: first.index }),
			]),
			message: `${subject} has ${members.length} versions but only ${slugged} states ${rule.slug}. ${rule.because}`,
		});
	};

	const rowsByGroup = new Map<string, Member[]>();
	for (const [index, entry] of entries.entries()) {
		if (!isEntry(entry)) continue;
		const group = entry[rule.groupBy];
		if (typeof group !== "string") continue;
		rowsByGroup.set(group, [
			...(rowsByGroup.get(group) ?? []),
			{ entry, index, slugged: statesSlug(entry) },
		]);
	}
	for (const [group, members] of rowsByGroup) {
		report({ members, subject: `${rule.label} ${show(group)}` });
	}

	if (rule.collection === undefined || rule.identity === undefined) return;
	// A nested row is reported on the base entry that declares it without a
	// slug, so the finding points at a fixture the user can open.
	const linksByIdentity = new Map<
		string,
		{ base: string; members: Member[] }
	>();
	for (const [index, entry] of entries.entries()) {
		if (!isEntry(entry)) continue;
		const base = entry[rule.groupBy];
		const links = entry[rule.collection];
		if (typeof base !== "string" || !Array.isArray(links)) continue;
		for (const link of links) {
			if (!isEntry(link)) continue;
			const id = link[rule.identity];
			if (typeof id !== "string") continue;
			const current = linksByIdentity.get(id) ?? { base, members: [] };
			current.members.push({
				entry,
				index,
				slugged:
					pinOf({ entry: link, pins: rule.pins ?? [rule.slug] }) !== undefined,
			});
			linksByIdentity.set(id, current);
		}
	}
	for (const [id, { base, members }] of linksByIdentity) {
		const slugged = members.filter((member) => member.slugged).length;
		if (members.length <= 1 || slugged === members.length) continue;
		const first = members.find((member) => !member.slugged);
		if (first === undefined) continue;
		issues.push({
			path: render([
				...trail,
				crumbFor({ node, key, entry: first.entry, index: first.index }),
			]),
			message: `Variant ${show(id)} is declared under ${members.length} versions of ${show(base)} but only ${slugged} states ${rule.slug}. ${rule.because}`,
		});
	}
};

/** Rules about the collection as a whole, reported on the offending entry. */
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
		if (rule.kind === "versionSlugs")
			checkVersionSlugs({ entries, rule, node, key, trail, issues });
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
		for (const message of entryRuleFailures({
			entry,
			rule,
			document: walk.document,
			parent,
		})) {
			walk.issues.push({ path: at, message });
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

/** Array indices are elided from the path, so one rule covers every element. */
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
				parent,
			});
		}
		return;
	}

	walkEntry({ entry: value, path, trail: [...trail, key], walk, parent });
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
	const walk: Walk = { document, rules, hints, issues: [] };
	walkEntry({ entry: document, path: "", trail: [], walk });
	return walk.issues;
};
