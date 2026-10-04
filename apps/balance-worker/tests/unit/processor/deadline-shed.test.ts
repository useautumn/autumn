/** deadline-shed: arm B sheds a hot customer's checks while the task runs late; arm A answers exactly as the base does. */

import { afterEach, describe, expect, test } from "bun:test";
import {
	type CheckCommand,
	parseCheckCommand,
	type SubjectState,
} from "@autumn/balance-engine";
import { DEADLINE_SHED_EXPERIMENT } from "../../../src/experiments/deadlineShed.js";
import { workerErrorOf } from "../../../src/http/handlers/errorHandler/workerErrorOf.js";
import {
	createCheckAdmission,
	getCheckAdmission,
} from "../../../src/runtime/deadlineShed/checkAdmission.js";
import { CustomerCheckShedError } from "../../../src/runtime/deadlineShed/deadlineShedErrors.js";
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

/** The replies a fixed sequence of tracks and checks gets from a fresh processor under the current arm. */
const repliesOfSequence = async () => {
	const processor = await processorWith();
	const replies: unknown[] = [];
	for (let index = 0; index < 6; index++) {
		replies.push(
			await processor.track({
				command: createTrackCommand({
					identity,
					commandId: `t_${index}`,
					value: index + 1,
				}),
			}),
		);
		replies.push(
			await processor.check({ command: checkOf({ id: `c_${index}` }) }),
		);
	}
	return replies;
};

describe("deadline-shed arms", () => {
	test("A answers tracks and checks exactly as with the experiment unbound; B on an on-time task does too", async () => {
		const unbound = await repliesOfSequence();
		forceStagingArm({ experiment: DEADLINE_SHED_EXPERIMENT, arm: "A" });
		expect(await repliesOfSequence()).toEqual(unbound);
		forceStagingArm({ experiment: DEADLINE_SHED_EXPERIMENT, arm: "B" });
		expect(await repliesOfSequence()).toEqual(unbound);
	});

	test("a shed check reads as OVERLOADED, which the server fails open", () => {
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
		expect(admission.takeInterval()).toMatchObject({
			admitted: 40 + hot,
			shed: 400 - hot,
			shedCustomers: 1,
			behind: true,
		});
		expect(admission.takeInterval()).toMatchObject({
			admitted: 0,
			shed: 0,
			shedCustomers: 0,
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
