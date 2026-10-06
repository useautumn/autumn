import { describe, expect, test } from "bun:test";
import {
	type RetryCandidate,
	selectBrokenToRetry,
} from "./selectBrokenToRetry.ts";

const account = (
	id: string,
	state: RetryCandidate["state"],
	keyAvailable = true,
): RetryCandidate => ({ id, state, keyAvailable });

describe("selectBrokenToRetry", () => {
	test("retries only broken accounts, never clean, nuking or in-use ones", () => {
		const { retry, skipped } = selectBrokenToRetry({
			accounts: [
				account("acct_clean", "clean"),
				account("acct_in_use", "in_use"),
				account("acct_nuking", "nuking"),
				account("acct_broken_1", "broken"),
				account("acct_broken_2", "broken"),
			],
			liveNukeAccountIds: new Set(),
		});
		expect(retry).toEqual(["acct_broken_1", "acct_broken_2"]);
		expect(skipped).toEqual([]);
	});

	test("skips broken accounts that already have a queued or running nuke", () => {
		const { retry, skipped } = selectBrokenToRetry({
			accounts: [
				account("acct_queued", "broken"),
				account("acct_fresh", "broken"),
			],
			liveNukeAccountIds: new Set(["acct_queued", "acct_in_use"]),
		});
		expect(retry).toEqual(["acct_fresh"]);
		expect(skipped).toEqual(["acct_queued"]);
	});

	test("skips broken accounts whose key is missing or held by a full nuke or re-init", () => {
		const { retry, skipped } = selectBrokenToRetry({
			accounts: [
				account("acct_locked_key", "broken", false),
				account("acct_ok_key", "broken"),
				account("acct_in_use_locked", "in_use", false),
			],
			liveNukeAccountIds: new Set(),
		});
		expect(retry).toEqual(["acct_ok_key"]);
		expect(skipped).toEqual(["acct_locked_key"]);
	});

	test("an empty or fully healthy ledger selects nothing", () => {
		expect(
			selectBrokenToRetry({
				accounts: [account("acct_clean", "clean")],
				liveNukeAccountIds: new Set(),
			}),
		).toEqual({ retry: [], skipped: [] });
	});
});
