import { readFileSync } from "node:fs";

const file = process.argv[2];
const lineNum = parseInt(process.argv[3], 10);

const content = readFileSync(file, "utf-8");
const lines = content.split("\n");

const MULTILINE_LOOKAHEAD = 5;

const escapeRegex = (raw: string) => raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const templateToRegex = (raw: string) =>
	raw
		.split(/\$\{.*?\}/)
		.map(escapeRegex)
		.join(".*");

const BLOCK_NAME = String.raw`\b(?:describe|test(?:\.concurrent)?|Eval(?:<[^>]+>)?)`;
const BLOCK_OPEN = new RegExp(`${BLOCK_NAME}\\s*\\(`);

const MATCHERS: Array<[RegExp, (raw: string) => string]> = [
	[
		new RegExp(
			`${BLOCK_NAME}\\s*\\(\\s*\`\\$\\{chalk\\.\\w+\\(\`([\\s\\S]*?)\`\\)\\}\``,
		),
		templateToRegex,
	],
	[
		new RegExp(
			`${BLOCK_NAME}\\s*\\(\\s*\`\\$\\{chalk\\.\\w+\\(["'](.*?)["']\\)\\}\``,
		),
		escapeRegex,
	],
	[
		new RegExp(`${BLOCK_NAME}\\s*\\(\\s*chalk\\.\\w+\\(\\s*\`([\\s\\S]*?)\``),
		templateToRegex,
	],
	[
		new RegExp(`${BLOCK_NAME}\\s*\\(\\s*chalk\\.\\w+\\(\\s*["'](.*?)["']`),
		escapeRegex,
	],
	[new RegExp(`${BLOCK_NAME}\\s*\\(\\s*["'\`](.*?)["'\`]`), escapeRegex],
];

for (let i = lineNum - 1; i >= 0; i--) {
	if (!BLOCK_OPEN.test(lines[i])) continue;

	const joined = lines
		.slice(i, Math.min(lines.length, i + 1 + MULTILINE_LOOKAHEAD))
		.join("\n");

	for (const [pattern, transform] of MATCHERS) {
		const match = joined.match(pattern);
		if (match) {
			console.log(transform(match[1]));
			process.exit(0);
		}
	}
}

console.log(".*");
