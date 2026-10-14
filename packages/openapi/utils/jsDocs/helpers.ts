import type { JSDocParam } from "./createJSDocDescription.js";

interface JSDocExample {
	description?: string;
	values: Record<string, unknown>;
}

interface JSDocLink {
	url: string;
	title: string;
}

export function param(
	name: string,
	description: string,
	optional = false,
): JSDocParam {
	return { name, description, optional };
}

export function example(options: {
	values: Record<string, unknown>;
	description?: string;
}): JSDocExample {
	return { values: options.values, description: options.description };
}

export function docLink(options: { url: string; title: string }): JSDocLink {
	return { url: options.url, title: options.title };
}
