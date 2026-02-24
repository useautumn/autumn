import type { JSDocParam } from "./createJSDocDescription.js";

interface JSDocExample {
	description?: string;
	values: Record<string, unknown>;
}

interface JSDocLink {
	url: string;
	title: string;
}

/**
 * Shorthand helper for creating parameter definitions.
 */
export function param(
	name: string,
	description: string,
	optional = false,
): JSDocParam {
	return { name, description, optional };
}

/**
 * Shorthand helper for creating example definitions.
 */
export function example(options: {
	values: Record<string, unknown>;
	description?: string;
}): JSDocExample {
	return { values: options.values, description: options.description };
}

/**
 * Shorthand helper for creating documentation link definitions.
 */
export function docLink(options: { url: string; title: string }): JSDocLink {
	return { url: options.url, title: options.title };
}
