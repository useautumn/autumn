import { describe, expect, test } from "bun:test";
import { AuthType } from "@autumn/shared";
import {
	type BillingPlanIntent,
	type CommandActor,
	computeTrack,
	parseApplyBillingPlanRequest,
	parseMutationRecord,
	parseTrackCommand,
} from "../../../src/balanceEngine.js";
import {
	createCustomerEntitlement,
	createState,
	createSubjectFor,
	createTrackCommand,
	identity,
	occurredAt,
} from "../engineFixtures.js";

const secretKey: CommandActor = { type: AuthType.SecretKey, id: "key_1" };
const lockSweep: CommandActor = { type: "lock_sweep" };
const intent: BillingPlanIntent = {
	action: "upgrade",
	fromPlanIds: ["pro"],
	toPlanIds: ["premium"],
};

const planRequest = ({ command }: { command: Record<string, unknown> }) => ({
	command: {
		schemaVersion: 1,
		type: "applyBillingPlan",
		commandId: "plan_1",
		requestId: "req_plan_1",
		identity,
		occurredAt,
		entityIds: [],
		ops: [
			{
				op: "insert",
				table: "customerEntitlements",
				row: createCustomerEntitlement(),
			},
		],
		...command,
	},
	catalogRows: [],
});

describe("who asked and why, on a command", () => {
	test("a command carries an actor, or none at all", () => {
		expect(
			parseTrackCommand({
				input: { ...createTrackCommand(), actor: secretKey },
			}).actor,
		).toEqual(secretKey);
		expect(
			parseTrackCommand({
				input: { ...createTrackCommand(), actor: lockSweep },
			}).actor,
		).toEqual(lockSweep);
		expect(
			parseTrackCommand({ input: createTrackCommand() }).actor,
		).toBeUndefined();
	});

	test("an actor keeps a field a newer server sends", () => {
		const actor: CommandActor = { ...secretKey, name: "CI deploy key" };

		expect(
			parseTrackCommand({ input: { ...createTrackCommand(), actor } }).actor,
		).toEqual(actor);
	});

	test("an actor of a kind the engine does not know yet is passed through", () => {
		const actor: CommandActor = { type: "cron_job" };

		expect(
			parseTrackCommand({ input: { ...createTrackCommand(), actor } }).actor,
		).toEqual(actor);
	});

	test("a billing plan carries its intent, or none at all", () => {
		expect(
			parseApplyBillingPlanRequest({
				input: planRequest({ command: { intent } }),
			}).command.intent,
		).toEqual(intent);
		expect(
			parseApplyBillingPlanRequest({ input: planRequest({ command: {} }) })
				.command.intent,
		).toBeUndefined();
	});

	test("an action the engine does not know yet is passed through", () => {
		const reprice: BillingPlanIntent = { ...intent, action: "reprice" };

		expect(
			parseApplyBillingPlanRequest({
				input: planRequest({ command: { intent: reprice } }),
			}).command.intent,
		).toEqual(reprice);
	});

	test("an actor or action needs a name", () => {
		expect(() =>
			parseTrackCommand({
				input: { ...createTrackCommand(), actor: { type: "" } },
			}),
		).toThrow();
		expect(() =>
			parseApplyBillingPlanRequest({
				input: planRequest({ command: { intent: { ...intent, action: "" } } }),
			}),
		).toThrow();
	});

	test("intent belongs to a billing plan, not a track", () => {
		expect(() =>
			parseTrackCommand({ input: { ...createTrackCommand(), intent } }),
		).toThrow();
	});

	test("a record keeps the actor its command carried", () => {
		const command = parseTrackCommand({
			input: { ...createTrackCommand(), actor: secretKey },
		});
		const record = {
			...computeTrack({
				fullSubject: createSubjectFor({ state: createState() }),
				command,
			}),
			receipt: { fingerprint: "fp_1", expiresAt: 1_700_086_400_000 },
		};

		expect(
			parseMutationRecord({ input: JSON.parse(JSON.stringify(record)) })
				.command,
		).toMatchObject({ actor: secretKey });
	});
});
