/**
 * Build-time Svix partitioner for the `bun tw` swarm (plan §7).
 *
 * Detection rule (exact, verified): a test file needs Svix iff it imports
 * `@tests/integration/utils/svixWebhookTestUtils`. There is a single entrypoint,
 * imported directly (no barrel), so a one-hop static scan over each `.test.ts`
 * has zero false positives/negatives.
 *
 * Routing: per §7's recommendation, ALL Svix files (26 at time of writing) are
 * routed onto ONE dedicated "svix shard" — a single worker that runs them
 * sequentially. They're simple, fast tests, and a single shard means exactly one
 * `createSvixApp` + one worker with `SVIX_API_KEY` injected per run. Every other
 * worker leaves `SVIX_API_KEY` unset, keeping the general pool fully isolated.
 */

import { readFile } from "node:fs/promises";
import type { ShardPlan } from "../types.js";

/** Matches `from "@tests/integration/utils/svixWebhookTestUtils"` (optional `.js`). */
const SVIX_IMPORT_REGEX =
	/from\s+["']@tests\/integration\/utils\/svixWebhookTestUtils(\.js)?["']/;

/** Max number of files read concurrently to keep file-descriptor pressure bounded. */
const READ_CONCURRENCY = 32;

/**
 * Returns whether a single test file needs the Svix shard by statically scanning
 * its source for the `svixWebhookTestUtils` import. Returns `false` (and does not
 * throw) when the file can't be read, so a transient read error never silently
 * promotes a non-Svix file onto the dedicated shard.
 */
export const needsSvix = async (file: string): Promise<boolean> => {
	try {
		const source = await readFile(file, "utf8");
		return SVIX_IMPORT_REGEX.test(source);
	} catch {
		return false;
	}
};

/**
 * Partitions the selected test files into the dedicated Svix shard
 * (`svixFiles`) vs. the general pool (`normalFiles`) by scanning each file's
 * imports. Files are read concurrently with a bounded window; the input order is
 * preserved within each bucket.
 */
export const partitionShards = async (
	testFiles: string[],
): Promise<ShardPlan> => {
	const flags = new Array<boolean>(testFiles.length);

	for (let start = 0; start < testFiles.length; start += READ_CONCURRENCY) {
		const window = testFiles.slice(start, start + READ_CONCURRENCY);
		const results = await Promise.all(window.map((file) => needsSvix(file)));
		for (const [offset, isSvix] of results.entries()) {
			flags[start + offset] = isSvix;
		}
	}

	const svixFiles: string[] = [];
	const normalFiles: string[] = [];
	for (const [index, file] of testFiles.entries()) {
		if (flags[index]) {
			svixFiles.push(file);
		} else {
			normalFiles.push(file);
		}
	}

	return { svixFiles, normalFiles };
};
