import { readFileSync, writeFileSync } from "node:fs";

/**
 * Runtime code that is the same for every concept is a real, type-checked
 * file in this package, copied into the CLI as-is — not TypeScript inside a
 * template string.
 */
export const copyRuntime = ({
	from,
	to,
	sourceLabel,
}: {
	from: string;
	to: string;
	sourceLabel: string;
}): void => {
	const header = `// Copied by @autumn/atmn-generator from ${sourceLabel}.
// Do not edit — change that file and run \`bun generate\` instead.

`;
	writeFileSync(to, `${header}${readFileSync(from, "utf8")}`, "utf8");
};
