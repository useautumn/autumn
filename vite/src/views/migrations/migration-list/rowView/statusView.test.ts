import { expect, test } from "bun:test";
import {
	FIXTURE_NOW,
	fixtureMigrations,
} from "../preview/migrationListFixtures";
import { deriveStatusView } from "./statusView";

const statusOf = (id: string) => {
	const migration = fixtureMigrations.find((candidate) => candidate.id === id);
	if (!migration) throw new Error(`fixture ${id} missing`);
	return deriveStatusView({
		status: migration.status,
		summary: migration.summary,
		now: FIXTURE_NOW,
	});
};

const pill = (id: string) => {
	const { ring, chip } = statusOf(id);
	return { ring, label: chip.label, detail: chip.details?.[0] };
};

test("running shows percent of the filter count, with in-flight and not-reached segments", () => {
	const view = statusOf("migration-pro-v3-rollout");
	expect(pill("migration-pro-v3-rollout")).toEqual({
		ring: { tone: "green", fraction: 312 / 1248 },
		label: "Running",
		detail: "25%",
	});
	expect(view.card.legend).toEqual([
		{ kind: "migrated", value: 280 },
		{ kind: "up_to_date", value: 20 },
		{ kind: "skipped", value: 4 },
		{ kind: "failed", value: 8 },
		{ kind: "in_flight", value: 24 },
		{ kind: "not_reached", value: 912 },
	]);
	expect(view.card?.when).toBe("Started 12 minutes ago");
});

test("waiting shows how many runs are ahead with every customer unreached", () => {
	const view = statusOf("migration-enterprise-seats");
	expect(pill("migration-enterprise-seats")).toEqual({
		ring: { tone: "yellow", fraction: 0 },
		label: "Waiting",
		detail: "· 1 ahead",
	});
	expect(view.card.legend).toEqual([{ kind: "not_reached", value: 86 }]);
});

test("draft badges stay plain; the card names the dry run or sample", () => {
	expect(pill("migration-a7k")).toEqual({
		ring: { tone: "neutral", fraction: 0 },
		label: "Draft",
		detail: undefined,
	});
	expect(statusOf("migration-a7k").card).toEqual({
		chip: { label: "Draft", details: undefined },
		when: "Created Sep 27, 10:00",
		note: null,
		error: null,
		legend: [],
	});
	expect(pill("migration-growth-annual").detail).toBeUndefined();

	const dry = statusOf("migration-starter-dry");
	expect(pill("migration-starter-dry").detail).toBeUndefined();
	expect(dry.card.chip.details).toEqual(["· dry run"]);
	expect(dry.card.legend).toEqual([
		{ kind: "would_change", value: 57 },
		{ kind: "would_fail", value: 3 },
	]);

	const sample = statusOf("migration-hobby-backfill");
	expect(pill("migration-hobby-backfill").detail).toBeUndefined();
	expect(sample.card.chip.details).toEqual(["· sample"]);
	expect(sample.card?.legend).toEqual([{ kind: "sampled", value: 10 }]);
});

test("a dry run where few customers would change lists only the changed ones", () => {
	const view = deriveStatusView({
		status: "draft",
		summary: {
			customer_count: 100,
			latest_run: null,
			latest_dry_run: {
				status: "succeeded",
				finished_at: FIXTURE_NOW,
				previewed: 100,
				would_change: 1,
				would_fail: 0,
			},
			latest_sample: null,
			queue_position: null,
			last_activity: { kind: "dry_run", at: FIXTURE_NOW },
		},
		now: FIXTURE_NOW,
	});
	expect(view.card?.legend).toEqual([{ kind: "would_change", value: 1 }]);
});

test("a failed latest dry run reads as failed, not done", () => {
	const view = deriveStatusView({
		status: "draft",
		summary: {
			customer_count: 10,
			latest_run: null,
			latest_dry_run: {
				status: "failed",
				finished_at: FIXTURE_NOW,
				previewed: 4,
				would_change: 2,
				would_fail: 2,
			},
			latest_sample: null,
			queue_position: null,
			last_activity: { kind: "dry_run", at: FIXTURE_NOW },
		},
		now: FIXTURE_NOW,
	});
	expect(view.chip).toEqual({ label: "Draft", details: undefined });
	expect(view.card.chip.details).toEqual(["· dry run failed"]);
});

test("completed is green when clean and amber with the failed count", () => {
	expect(pill("migration-legacy-free-to-hobby")).toEqual({
		ring: { tone: "green", fraction: 1 },
		label: "Completed",
		detail: undefined,
	});
	expect(pill("migration-seat-licenses")).toEqual({
		ring: { tone: "amber", fraction: 1 },
		label: "Completed",
		detail: "· 2 failed",
	});
});

test("a completed run with later filter matches reports them instead of not reached", () => {
	const view = statusOf("migration-plan-variants");
	expect(view.card.legend).toEqual([
		{ kind: "migrated", value: 884 },
		{ kind: "skipped", value: 1 },
		{ kind: "failed", value: 1 },
	]);
	expect(view.card.note).toBe(
		"245 more customers match the filter now than this run covered",
	);
});

test("no changes is a full neutral ring with every customer up to date", () => {
	const view = statusOf("migration-api-credits-topup");
	expect(pill("migration-api-credits-topup")).toEqual({
		ring: { tone: "neutral", fraction: 1 },
		label: "No changes",
		detail: undefined,
	});
	expect(view.card.legend).toEqual([{ kind: "up_to_date", value: 540 }]);
});

test("failed and canceled report where they stopped and what was not reached", () => {
	const failed = statusOf("migration-starter-v2");
	expect(pill("migration-starter-v2")).toEqual({
		ring: { tone: "orange", fraction: 812 / 1020 },
		label: "Incomplete",
		detail: "at 80%",
	});
	expect(failed.card).toEqual({
		chip: { label: "Incomplete", details: ["at 80%"] },
		when: "Sep 15, 14:32 · after 18 minutes",
		note: null,
		error:
			"Stripe returned an error, so the run stopped. Customers already migrated keep their changes.",
		legend: [
			{ kind: "migrated", value: 798 },
			{ kind: "failed", value: 14 },
			{ kind: "not_reached", value: 208 },
		],
	});

	expect(pill("migration-annual-cleanup")).toEqual({
		ring: { tone: "neutral", fraction: 120 / 900 },
		label: "Canceled",
		detail: "at 13%",
	});
});

test("a failed run explains its error code in plain words", () => {
	const view = statusOf("migration-credits-reset");
	expect(pill("migration-credits-reset")).toEqual({
		ring: { tone: "orange", fraction: 881 / 904 },
		label: "Incomplete",
		detail: "at 97%",
	});
	expect(view.card.error).toBe(
		"The run stopped before it could confirm every update. Changes already applied are kept, and unconfirmed customers are marked failed so you can retry them.",
	);
	expect(view.card.legend).toEqual([
		{ kind: "failed", value: 881 },
		{ kind: "not_reached", value: 23 },
	]);
});

test("an unclassified error gets a generic sentence, never the raw message", () => {
	const migration = fixtureMigrations.find(
		(candidate) => candidate.id === "migration-credits-reset",
	);
	if (!migration?.summary.latest_run) throw new Error("fixture missing");
	const view = deriveStatusView({
		status: "failed",
		summary: {
			...migration.summary,
			latest_run: {
				...migration.summary.latest_run,
				error_message: "Migration chunk made no progress before continuation",
				error_code: "unknown",
			},
		},
		now: FIXTURE_NOW,
	});
	expect(view.card.error).toBe(
		"The run stopped unexpectedly. Customers already migrated keep their changes.",
	);
});
