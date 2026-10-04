/**
 * deadline-shed: arm B drops a request whose caller has already given up before anything is decided for it, and
 * sheds a hot customer's checks while the task runs late. Arm A answers exactly as the base does.
 */

import { afterEach, describe, expect, test } from "bun:test";
import {
	type CheckCommand,
	parseCheckCommand,
	type SubjectState,
} from "@autumn/balance-engine";
import { DEADLINE_SHED_EXPERIMENT } from "../../../src/experiments/deadlineShed.js";
import { workerErrorOf } from "../../../src/http/handlers/errorHandler/workerErrorOf.js";
import { runWithAnswerDeadline } from "../../../src/runtime/answerDeadline.js";
import { assertNotAbandoned } from "../../../src/runtime/deadlineShed/assertNotAbandoned.js";
import {
	createCheckAdmission,
	getCheckAdmission,
} from "../../../src/runtime/deadlineShed/checkAdmission.js";
import {
	CustomerCheckShedError,
	RequestAbandonedError,
} from "../../../src/runtime/deadlineShed/deadlineShedErrors.js";
import {
	createState,
	createTrackCommand,
	testOrg,
} from "../../fixtures/mutations.js";
import {
	createResidentProcessor,
	residentIdentityOf,
} from "../../fixtures/residentProcessor.js";
import {
	clearStagingArms,
	forceStagingArm,
} from "../../fixtures/stagingArms.js";

const identity = residentIdentityOf({ customerId: "cus_1" });

afterEach(() => clearStagingArms());

const checkOf = ({ id }: { id: string }): CheckCommand =>
	parseCheckCommand({
		input: {
			schemaVersion: 1,
			type: "check",
			org: testOrg,
			requestId: `req_${id}`,
			identity,
			featureId: "messages",
			internalFeatureId: "feat_messages",
			requiredBalance: 1,
			properties: null,
			occurredAt: 1_700_000_000_000,
		},
	});

const processorWith = () =>
	createResidentProcessor({
		states: [createState({ identity, balance: 100 }) as SubjectState],
	});

/** Runs `run` as the runtime runs a command with a caller budget that ran out `agoMs` ago. */
const abandoned = <Value>({
	agoMs = 1,
	run,
}: {
	agoMs?: number;
	run: () => Promise<Value>;
}) =>
	runWithAnswerDeadline({
		expiresAt: performance.now() + 60_000,
		abandonedAt: performance.now() - agoMs,
		run,
	});

const balanceOf = async (
	processor: Awaited<ReturnType<typeof processorWith>>,
) => {
	const reply = await processor.check({ command: checkOf({ id: "read" }) });
	return reply.state.customerEntitlements.reduce(
		(sum, row) => sum + row.balance,
		0,
	);
};

describe("abandoned requests", () => {
	test("B drops a request past its caller's budget; A and an unexpired request run", () => {
		const past = performance.now() - 1;
		const future = performance.now() + 60_000;
		expect(() => assertNotAbandoned({ abandonedAt: past })).not.toThrow();
		forceStagingArm({ experiment: DEADLINE_SHED_EXPERIMENT, arm: "B" });
		expect(() => assertNotAbandoned({ abandonedAt: past })).toThrow(
			RequestAbandonedError,
		);
		expect(() => assertNotAbandoned({ abandonedAt: future })).not.toThrow();
		expect(() => assertNotAbandoned({})).not.toThrow();
	});

	test("B rejects an abandoned track before it decides: no record, no deduction, the run's other tracks apply", async () => {
		forceStagingArm({ experiment: DEADLINE_SHED_EXPERIMENT, arm: "B" });
		const processor = await processorWith();
		const gaveUp = abandoned({
			run: () =>
				processor.track({
					command: createTrackCommand({
						identity,
						commandId: "t_gone",
						value: 7,
					}),
				}),
		});
		const waiting = processor.track({
			command: createTrackCommand({ identity, commandId: "t_live", value: 3 }),
		});
		await expect(gaveUp).rejects.toBeInstanceOf(RequestAbandonedError);
		expect((await waiting).result.status).toBe("applied");
		expect(await balanceOf(processor)).toBe(97);
		// The same command id is still free: its queued fallback applies it once, later.
		const replayed = await processor.track({
			command: createTrackCommand({ identity, commandId: "t_gone", value: 7 }),
		});
		expect(replayed.result.status).toBe("applied");
		expect(await balanceOf(processor)).toBe(90);
	});

	test("A decides the same abandoned track as the base does", async () => {
		const processor = await processorWith();
		const reply = await abandoned({
			run: () =>
				processor.track({
					command: createTrackCommand({
						identity,
						commandId: "t_gone",
						value: 7,
					}),
				}),
		});
		expect(reply.result.status).toBe("applied");
		expect(await balanceOf(processor)).toBe(93);
	});

	test("B drops a check whose caller gave up while it waited for its turn", async () => {
		forceStagingArm({ experiment: DEADLINE_SHED_EXPERIMENT, arm: "B" });
		const processor = await processorWith();
		const run = processor.track({
			command: createTrackCommand({ identity, commandId: "t_1", value: 1 }),
		});
		const check = abandoned({
			run: () => processor.check({ command: checkOf({ id: "c_gone" }) }),
		});
		await expect(check).rejects.toBeInstanceOf(RequestAbandonedError);
		await run;
		const live = await processor.check({ command: checkOf({ id: "c_live" }) });
		expect(live.result.allowed).toBe(true);
	});

	test("a dropped request reads as NOT_READY, nothing ran; a shed check as OVERLOADED", () => {
		expect(workerErrorOf({ cause: new RequestAbandonedError() })).toMatchObject(
			{
				status: 503,
				error: { code: "NOT_READY" },
			},
		);
		expect(
			workerErrorOf({ cause: new CustomerCheckShedError() }),
		).toMatchObject({
			status: 429,
			error: { code: "OVERLOADED" },
		});
	});
});

describe("check admission", () => {
	const admissionAt = () => {
		let clock = 0;
		let probe: () => void = () => undefined;
		const admission = createCheckAdmission({
			now: () => clock,
			schedule: ({ run }) => {
				probe = run;
				return () => undefined;
			},
		});
		return {
			admission,
			/** Advances the clock; probes fire on time, or once late by `lateMs`. */
			advance: ({ ms, lateMs = 0 }: { ms: number; lateMs?: number }) => {
				for (let elapsed = 0; elapsed < ms; elapsed += 10) {
					clock += 10;
					probe();
				}
				if (lateMs > 0) {
					clock += lateMs;
					probe();
					probe();
				}
			},
		};
	};

	const offer = ({
		admission,
		customerKey,
		count,
	}: {
		admission: ReturnType<typeof createCheckAdmission>;
		customerKey: string;
		count: number;
	}) => {
		let admitted = 0;
		for (let index = 0; index < count; index++)
			if (admission.admit({ customerKey })) admitted++;
		return admitted;
	};

	test("on time, every customer's checks are admitted whatever its share", () => {
		const { admission, advance } = admissionAt();
		advance({ ms: 100 });
		expect(offer({ admission, customerKey: "hot", count: 500 })).toBe(500);
		expect(offer({ admission, customerKey: "cold", count: 10 })).toBe(10);
	});

	test("running late, the customer holding most checks is shed down to half; the others are not", () => {
		const { admission, advance } = admissionAt();
		advance({ ms: 100, lateMs: 400 });
		const cold = offer({ admission, customerKey: "cold_1", count: 20 });
		const hot = offer({ admission, customerKey: "hot", count: 400 });
		const cold2 = offer({ admission, customerKey: "cold_2", count: 20 });
		expect(cold).toBe(20);
		expect(cold2).toBe(20);
		expect(hot).toBeGreaterThan(0);
		expect(hot).toBeLessThan(400);
		expect(admission.readCounters()).toMatchObject({
			shed: 400 - hot,
			behind: true,
		});
		advance({ ms: 200 });
		expect(admission.readCounters().behind).toBe(false);
		expect(offer({ admission, customerKey: "hot", count: 400 })).toBe(400);
	});

	test("a customer below the minimum is never shed, even alone on a late task", () => {
		const { admission, advance } = admissionAt();
		advance({ ms: 100, lateMs: 400 });
		expect(offer({ admission, customerKey: "alone", count: 25 })).toBe(25);
		expect(admission.readCounters().behind).toBe(true);
	});

	test("only B's checks are counted by admission; A's never reach it", async () => {
		const processor = await processorWith();
		const countedBefore = getCheckAdmission().readCounters().admitted;
		for (let index = 0; index < 5; index++)
			await processor.check({ command: checkOf({ id: `a_${index}` }) });
		expect(getCheckAdmission().readCounters().admitted).toBe(countedBefore);
		forceStagingArm({ experiment: DEADLINE_SHED_EXPERIMENT, arm: "B" });
		const reply = await processor.check({ command: checkOf({ id: "b_0" }) });
		expect(reply.result.allowed).toBe(true);
		expect(getCheckAdmission().readCounters().admitted).toBe(countedBefore + 1);
	});
});
