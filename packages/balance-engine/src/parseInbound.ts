import { z } from "zod/v4";

/** Told which keys were dropped, as dotted paths with `*` for an array index. */
export type OnUnknownKeys = (params: { keyPaths: string[] }) => void;

type UnknownKey = { path: PropertyKey[]; key: string };

/**
 * Parses a message a newer producer may have sent: unknown keys at or under `within` are dropped and
 * reported, never rejected. Any other issue still throws, so a missing or mistyped field fails as before.
 */
export function parseInbound<Parsed>({
	parse,
	input,
	within = [],
	onUnknownKeys,
}: {
	parse: (params: { input: unknown }) => Parsed;
	input: unknown;
	within?: readonly PropertyKey[];
	onUnknownKeys?: OnUnknownKeys;
}): Parsed {
	try {
		return parse({ input });
	} catch (cause) {
		const unknownKeys = unknownKeysOnly({ cause, within });
		if (!unknownKeys) throw cause;
		const parsed = parse({ input: withoutKeys({ input, unknownKeys }) });
		onUnknownKeys?.({ keyPaths: [...new Set(unknownKeys.map(keyPathOf))] });
		return parsed;
	}
}

/** The keys `cause` rejects as unknown, or null when it has any other issue or one outside `within`. */
function unknownKeysOnly({
	cause,
	within,
}: {
	cause: unknown;
	within: readonly PropertyKey[];
}): UnknownKey[] | null {
	if (!(cause instanceof z.ZodError)) return null;
	const unknownKeys: UnknownKey[] = [];
	for (const issue of cause.issues) {
		if (issue.code !== "unrecognized_keys") return null;
		if (!isWithin({ path: issue.path, within })) return null;
		for (const key of issue.keys) unknownKeys.push({ path: issue.path, key });
	}
	return unknownKeys;
}

function isWithin({
	path,
	within,
}: {
	path: PropertyKey[];
	within: readonly PropertyKey[];
}): boolean {
	return within.every((segment, index) => path[index] === segment);
}

/** A copy without the unknown keys: the caller's input is left as it arrived. */
function withoutKeys({
	input,
	unknownKeys,
}: {
	input: unknown;
	unknownKeys: UnknownKey[];
}): unknown {
	const copy = structuredClone(input);
	for (const { path, key } of unknownKeys) {
		const owner = path.reduce<unknown>(
			(node, segment) => (node as Record<PropertyKey, unknown>)[segment],
			copy,
		) as Record<string, unknown>;
		delete owner[key];
	}
	return copy;
}

function keyPathOf({ path, key }: UnknownKey): string {
	return [...path, key]
		.map((segment) => (typeof segment === "number" ? "*" : String(segment)))
		.join(".");
}
