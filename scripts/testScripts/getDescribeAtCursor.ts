import { readFileSync } from "fs";

const file = process.argv[2];
const lineNum = parseInt(process.argv[3], 10);

const content = readFileSync(file, "utf-8");
const lines = content.split("\n");

const MULTILINE_LOOKAHEAD = 5;

const escape = (raw: string) => raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const CHALK_PATTERN =
	/(?:describe|test(?:\.concurrent)?)\s*\(\s*`\$\{chalk\.\w+\(["'](.*?)["']\)\}`/;
const SIMPLE_PATTERN =
	/(?:describe|test(?:\.concurrent)?)\s*\(\s*["'`](.*?)["'`]/;
const OPEN_PATTERN = /(?:describe|test(?:\.concurrent)?)\s*\(\s*$/;

// Walk backwards from cursor to find enclosing describe, test, or test.concurrent.
// Each candidate also gets a multi-line lookahead so name args wrapped onto the
// next line(s) — `test.concurrent(\n\t\`${chalk.yellowBright("name")}\`,` — are matched.
for (let i = lineNum - 1; i >= 0; i--) {
	const line = lines[i];

	const chalkMatch = line.match(CHALK_PATTERN);
	if (chalkMatch) {
		console.log(escape(chalkMatch[1]));
		process.exit(0);
	}

	const simpleMatch = line.match(SIMPLE_PATTERN);
	if (simpleMatch) {
		console.log(escape(simpleMatch[1]));
		process.exit(0);
	}

	if (OPEN_PATTERN.test(line)) {
		const joined = lines
			.slice(i, Math.min(lines.length, i + 1 + MULTILINE_LOOKAHEAD))
			.join("\n");
		const chalkMulti = joined.match(CHALK_PATTERN);
		if (chalkMulti) {
			console.log(escape(chalkMulti[1]));
			process.exit(0);
		}
		const simpleMulti = joined.match(SIMPLE_PATTERN);
		if (simpleMulti) {
			console.log(escape(simpleMulti[1]));
			process.exit(0);
		}
	}
}

console.log(".*"); // fallback: run all
