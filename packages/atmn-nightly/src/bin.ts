#!/usr/bin/env node
import { run } from "./cli";

// The npm entry: node has no import.meta.main, so the run happens here.
run({ argv: process.argv }).catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	process.stderr.write(`${message}\n`);
	process.exit(1);
});
