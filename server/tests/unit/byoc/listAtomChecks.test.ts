import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from "bun:test";
import {
	AppEnv,
	type ByocCacheDeployment,
	ByocCacheStatus,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { cacheDeploymentRepo } from "@/internal/byoc/repos/cacheDeploymentRepo.js";
import { toCacheStages } from "@/internal/byoc/utils/cacheStageUtils.js";

const queryAtomLogsModulePath =
	"@/internal/byoc/actions/telemetry/atomLogs/queryAtomLogs";
const realQueryAtomLogs = { ...(await import(queryAtomLogsModulePath)) };

type Query = { deploymentId: string; startTime: string; pipeline: string };
const queries: Query[] = [];
/** What Axiom holds for the Atom: health ticks whose interval counted a request, and the request lines it logged. */
let countedTicks: Record<string, unknown>[] = [];
let loggedChecks: Record<string, unknown>[] = [];

mock.module(queryAtomLogsModulePath, () => ({
	...realQueryAtomLogs,
	queryAtomLogs: async (query: Query) => {
		queries.push(query);
		return query.pipeline.includes("interval.requests")
			? countedTicks
			: loggedChecks;
	},
}));

const { listAtomChecks } = await import(
	"@/internal/byoc/actions/telemetry/listAtomChecks"
);

const CREATED_AT = Date.parse("2026-10-15T12:59:00.000Z");
const FIRST_TICK = "2026-10-15T13:52:39.604Z";

const atomRow = ({
	firstCheckSeenAt = null,
}: {
	firstCheckSeenAt?: number | null;
} = {}): ByocCacheDeployment => ({
	id: "atom_1",
	org_id: "org_1",
	env: AppEnv.Live,
	deployment_group_id: "dg_1",
	deployment_id: "dep_1",
	status: ByocCacheStatus.Ready,
	endpoint_url: "https://atom.example.com",
	cpu: 4,
	memory: 8,
	encrypted_token: "encrypted",
	token_hash: null,
	region: "us-east-1",
	network: null,
	stack_name: null,
	name: null,
	stages: toCacheStages({ doneStages: [], status: ByocCacheStatus.Ready }),
	error: null,
	first_check_at: null,
	first_check_seen_at: firstCheckSeenAt,
	created_at: CREATED_AT,
});

const ctx = {} as AutumnContext;
const writes: number[] = [];

const spies: { mockRestore(): void }[] = [];

const storeRow = (row: ByocCacheDeployment) => {
	spies.push(
		spyOn(cacheDeploymentRepo, "find").mockResolvedValue(row),
		spyOn(cacheDeploymentRepo, "setFirstCheckSeenAt").mockImplementation(
			async ({ firstCheckSeenAt }) => {
				writes.push(firstCheckSeenAt);
			},
		),
	);
};

beforeEach(() => {
	queries.length = 0;
	writes.length = 0;
	countedTicks = [];
	loggedChecks = [];
});

afterEach(() => {
	for (const spy of spies.splice(0)) spy.mockRestore();
});

afterAll(() => {
	mock.module(queryAtomLogsModulePath, () => realQueryAtomLogs);
});

describe("an Atom's first check", () => {
	test("an Atom only probed on /health counts no request, so it stays waiting", async () => {
		storeRow(atomRow());

		expect(await listAtomChecks({ ctx })).toEqual({
			first_check_seen_at: null,
			checks: [],
		});
		expect(writes).toEqual([]);
	});

	test("is read from the unsampled health counters since the Atom was created", async () => {
		storeRow(atomRow());

		await listAtomChecks({ ctx });

		const healthQuery = queries.find((query) =>
			query.pipeline.includes("interval.requests"),
		);
		expect(healthQuery).toMatchObject({
			deploymentId: "dep_1",
			startTime: "2026-10-15T12:59:00.000Z",
		});
		expect(healthQuery?.pipeline).toContain('"atom_health"');
		expect(healthQuery?.pipeline).toContain(
			"todouble(parse_json(line).data.interval.requests) > 0",
		);
		expect(queries.map((query) => query.startTime)).toEqual([
			"2026-10-15T12:59:00.000Z",
			"2026-10-15T12:59:00.000Z",
		]);
	});

	test("the first counted request is written once and returned with the checks the Atom logged", async () => {
		storeRow(atomRow());
		countedTicks = [{ _time: FIRST_TICK }];
		loggedChecks = [
			{
				_time: "2026-10-15T13:52:38.900Z",
				customer_id: "customer_123",
				feature_id: "feature_123",
				forwarded: "",
			},
		];

		expect(await listAtomChecks({ ctx })).toEqual({
			first_check_seen_at: Date.parse(FIRST_TICK),
			checks: [
				{
					at: Date.parse("2026-10-15T13:52:38.900Z"),
					customer_id: "customer_123",
					feature_id: "feature_123",
					answered_by: "atom",
				},
			],
		});
		expect(writes).toEqual([Date.parse(FIRST_TICK)]);
	});

	test("a counted request none of the sampled lines show still counts", async () => {
		storeRow(atomRow());
		countedTicks = [{ _time: FIRST_TICK }];

		expect(await listAtomChecks({ ctx })).toEqual({
			first_check_seen_at: Date.parse(FIRST_TICK),
			checks: [],
		});
	});

	test("once seen, it comes from the row with no Axiom query, however long ago it was", async () => {
		storeRow(atomRow({ firstCheckSeenAt: Date.parse(FIRST_TICK) }));

		expect(await listAtomChecks({ ctx })).toEqual({
			first_check_seen_at: Date.parse(FIRST_TICK),
			checks: [],
		});
		expect(queries).toEqual([]);
		expect(writes).toEqual([]);
	});
});
