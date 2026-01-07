import { readFileSync } from "fs";

const file = process.argv[2];
const lineNum = parseInt(process.argv[3], 10);

const content = readFileSync(file, "utf-8");
const lines = content.split("\n");

// Walk backwards from cursor to find enclosing describe or test.concurrent
for (let i = lineNum - 1; i >= 0; i--) {
	const line = lines[i];

	// Match describe/test.concurrent with chalk.yellowBright or similar
	const chalkMatch = line.match(
		/(?:describe|test\.concurrent)\s*\(\s*`\$\{chalk\.\w+\(["'](.*?)["']\)\}`/,
	);
	if (chalkMatch) {
		console.log(chalkMatch[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
		process.exit(0);
	}

	// Match simple describe/test.concurrent: ("name", ...) or ('name', ...) or (`name`, ...)
	const simpleMatch = line.match(
		/(?:describe|test\.concurrent)\s*\(\s*["'`](.*?)["'`]/,
	);
	if (simpleMatch) {
		console.log(simpleMatch[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
		process.exit(0);
	}
}

console.log(".*"); // fallback: run all
