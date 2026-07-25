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

// Chalk forms must precede the plain-string form: it would otherwise capture the
// `${` prefix of a template-wrapped name and stop at the quote inside it.
const MATCHERS: Array<[RegExp, (raw: string) => string]> = [
	// test(`${chalk.x(`name`)}`
	[
		new RegExp(
			`${BLOCK_NAME}\\s*\\(\\s*\`\\$\\{chalk\\.\\w+\\(\`([\\s\\S]*?)\`\\)\\}\``,
		),
		templateToRegex,
	],
	// test(`${chalk.x("name")}`
	[
		new RegExp(
			`${BLOCK_NAME}\\s*\\(\\s*\`\\$\\{chalk\\.\\w+\\(["'](.*?)["']\\)\\}\``,
		),
		escapeRegex,
	],
	// test(chalk.x(`name`)
	[
		new RegExp(`${BLOCK_NAME}\\s*\\(\\s*chalk\\.\\w+\\(\\s*\`([\\s\\S]*?)\``),
		templateToRegex,
	],
	// test(chalk.x("name")
	[
		new RegExp(`${BLOCK_NAME}\\s*\\(\\s*chalk\\.\\w+\\(\\s*["'](.*?)["']`),
		escapeRegex,
	],
	// test("name")
	[new RegExp(`${BLOCK_NAME}\\s*\\(\\s*["'\`](.*?)["'\`]`), escapeRegex],
];

// Walk backwards from the cursor to the nearest enclosing block opener. Each
// candidate is matched over a short multi-line window, so a name argument
// wrapped onto following lines is still found.
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

console.log(".*"); // fallback: run all
