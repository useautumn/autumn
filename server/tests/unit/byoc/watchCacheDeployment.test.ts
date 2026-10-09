import {
	afterAll,
	beforeEach,
	describe,
	expect,
	mock,
	setSystemTime,
	test,
} from "bun:test";
import {
	AppEnv,
	type ByocCacheDeployment,
	ByocCacheStage,
	ByocCacheStatus,
	ErrCode,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { toCacheStages } from "@/internal/byoc/utils/cacheStageUtils.js";

const READ_MODULE =
	"@/internal/byoc/actions/lifecycle/watchCacheDeployment/steps/readWatchedCacheDeployment.js";
const REFRESH_MODULE =
	"@/internal/byoc/actions/lifecycle/refreshCacheDeployment.js";
// Kept so afterAll can hand the real modules back: mock.module is process-wide.
const realReadModule: Record<string, unknown> = await import(READ_MODULE);
const realRefreshModule: Record<string, unknown> = await import(REFRESH_MODULE);

const cacheDeploymentIn = ({
	status,
	doneStages = [],
}: {
	status: ByocCacheDeployment["status"];
	doneStages?: ByocCacheStage[];
}): ByocCacheDeployment => ({
	id: "atom_1",
	org_id: "org_1",
	env: AppEnv.Sandbox,
	deployment_group_id: "dg_1",
	deployment_id: "dep_1",
	status,
	endpoint_url: null,
	cpu: 4,
	memory: 8,
	encrypted_token: "encrypted",
	token_hash: null,
	region: null,
	network: null,
	stack_name: null,
	stages: toCacheStages({ doneStages, status }),
	error: null,
	first_check_at: null,
	created_at: 1,
});

/** What alien reports on each poll, in order; a thrown error stands in for an outage. */
let reports: (ByocCacheDeployment | null | Error)[] = [];
let stored: ByocCacheDeployment | null = null;

mock.module(READ_MODULE, () => ({
	readWatchedCacheDeployment: async () => stored,
}));
mock.module(REFRESH_MODULE, () => ({
	refreshCacheDeployment: async () => {
		const report = reports.shift();
		if (report instanceof Error) throw report;
		stored = report ?? null;
		return stored;
	},
}));

afterAll(() => {
	mock.module(READ_MODULE, () => realReadModule);
	mock.module(REFRESH_MODULE, () => realRefreshModule);
});

const { watchCacheDeployment } = await import(
	"@/internal/byoc/actions/lifecycle/watchCacheDeployment/watchCacheDeployment.js"
);

const alienDown = () =>
	new RecaseError({
		message: "Atom is unavailable right now.",
		code: ErrCode.ByocUnavailable,
		statusCode: 503,
	});

const watch = async () => {
	const waits: number[] = [];
	const outcome = await watchCacheDeployment({
		ctx: {} as AutumnContext,
		deploymentGroupId: "dg_1",
		waitFor: async ({ seconds }) => {
			waits.push(seconds);
		},
	});
	return { outcome, waits };
};

beforeEach(() => {
	stored = cacheDeploymentIn({ status: ByocCacheStatus.AwaitingSetup });
});

describe("watching an Atom's deploy", () => {
	test("polls slower while the org works in AWS and faster as it nears connected", async () => {
		reports = [
			cacheDeploymentIn({ status: ByocCacheStatus.AwaitingSetup }),
			cacheDeploymentIn({
				status: ByocCacheStatus.Provisioning,
				doneStages: [ByocCacheStage.Stack],
			}),
			cacheDeploymentIn({
				status: ByocCacheStatus.Ready,
				doneStages: [ByocCacheStage.Atom],
			}),
			cacheDeploymentIn({
				status: ByocCacheStatus.Ready,
				doneStages: [ByocCacheStage.Connected],
			}),
		];

		expect(await watch()).toEqual({ outcome: "connected", waits: [15, 10, 5] });
	});

	test("stops at a failed deploy", async () => {
		reports = [cacheDeploymentIn({ status: ByocCacheStatus.Failed })];

		expect(await watch()).toEqual({ outcome: "failed", waits: [] });
	});

	test("backs off while alien is down, doubling up to its cap", async () => {
		reports = [
			...Array.from({ length: 6 }, alienDown),
			cacheDeploymentIn({ status: ByocCacheStatus.Failed }),
		];

		expect(await watch()).toEqual({
			outcome: "failed",
			waits: [10, 20, 40, 80, 120, 120],
		});
	});

	test("follows a delete until the record is gone", async () => {
		reports = [cacheDeploymentIn({ status: ByocCacheStatus.Removing }), null];

		expect(await watch()).toEqual({ outcome: "gone", waits: [10] });
	});

	test("stops when the org must delete its stack", async () => {
		reports = [cacheDeploymentIn({ status: ByocCacheStatus.TeardownRequired })];

		expect((await watch()).outcome).toBe("teardown_required");
	});

	test("a record that moved on ends the watch without polling", async () => {
		stored = null;
		reports = [cacheDeploymentIn({ status: ByocCacheStatus.Failed })];

		expect(await watch()).toEqual({ outcome: "gone", waits: [] });
		expect(reports).toHaveLength(1);
	});

	test("hands back to page reads after two hours of waiting on the org", async () => {
		reports = Array.from({ length: 1000 }, () =>
			cacheDeploymentIn({ status: ByocCacheStatus.AwaitingSetup }),
		);
		setSystemTime(new Date("2026-10-08T00:00:00Z"));
		const outcome = await watchCacheDeployment({
			ctx: {} as AutumnContext,
			deploymentGroupId: "dg_1",
			waitFor: async ({ seconds }) => {
				setSystemTime(new Date(Date.now() + seconds * 1000));
			},
		});
		setSystemTime();

		expect(outcome).toBe("timed_out");
		expect(reports).toHaveLength(1000 - (2 * 60 * 60) / 15);
	});

	test("an error that is not an outage fails the run", async () => {
		reports = [new Error("boom")];

		await expect(watch()).rejects.toThrow("boom");
	});
});
