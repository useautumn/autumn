import { describe, expect, test } from "bun:test";
import {
	defaultSubjectSnapshotsEdgeConfig,
	type SubjectSnapshotsEdgeConfig,
	stampSubjectSnapshotsWrittenAfter,
} from "../../src/edgeConfig.js";

const NOW = 1_760_000_000_000;
const withMode = (
	mode: SubjectSnapshotsEdgeConfig["mode"],
	writtenAfter = 42,
): SubjectSnapshotsEdgeConfig => ({
	...defaultSubjectSnapshotsEdgeConfig(),
	mode,
	writtenAfter,
});

describe("stampSubjectSnapshotsWrittenAfter", () => {
	test("leaving off stamps writtenAfter with now, for every mode past off", () => {
		for (const mode of ["write", "verify", "serve"] as const) {
			expect(
				stampSubjectSnapshotsWrittenAfter({
					previous: withMode("off"),
					next: withMode(mode),
					now: NOW,
				}).writtenAfter,
			).toBe(NOW);
		}
	});

	test("an unreadable previous record counts as off", () => {
		expect(
			stampSubjectSnapshotsWrittenAfter({
				previous: null,
				next: withMode("write"),
				now: NOW,
			}).writtenAfter,
		).toBe(NOW);
	});

	test("moving between modes past off, or staying off, keeps writtenAfter", () => {
		const cases = [
			["write", "verify"],
			["verify", "serve"],
			["serve", "write"],
			["serve", "off"],
			["off", "off"],
		] as const;
		for (const [from, to] of cases) {
			expect(
				stampSubjectSnapshotsWrittenAfter({
					previous: withMode(from),
					next: withMode(to),
					now: NOW,
				}).writtenAfter,
			).toBe(42);
		}
	});
});
