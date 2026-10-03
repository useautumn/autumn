/**
 * A check is decided once per (subject view, selection, second, required balance) and its reply reused
 * until a write replaces the state, the clock moves to the next second, or a due reset advances it.
 */

import { describe, expect, test } from "bun:test";
import {
	type CheckCommand,
	parseCheckCommand,
	type SubjectState,
} from "@autumn/balance-engine";
import type { CheckReply } from "@autumn/balance-worker-client/protocol";
import {
	createCustomerEntitlement,
	createState,
	createTrackCommand,
	testOrg,
} from "../../fixtures/mutations.js";
import {
	createResidentProcessor,
	residentIdentityOf,
} from "../../fixtures/residentProcessor.js";

/** A second boundary, so offsets below 1000 stay inside one second. */
const SECOND_START = 1_700_000_000_000;

const identityOf = residentIdentityOf;

const createProcessor = ({ states }: { states?: SubjectState[] } = {}) =>
	createResidentProcessor({
		states: states ?? [
			createState({
				identity: identityOf({ customerId: "cus_1" }),
				balance: 1_000,
			}),
		],
	});

const checkOf = ({
	customerId = "cus_1",
	at = SECOND_START,
	requiredBalance = 1,
	properties = null,
}: {
	customerId?: string;
	at?: number;
	requiredBalance?: number;
	properties?: Record<string, string> | null;
} = {}): CheckCommand =>
	parseCheckCommand({
		input: {
			schemaVersion: 1,
			type: "check",
			org: testOrg,
			requestId: `req_${at}_${requiredBalance}`,
			identity: identityOf({ customerId }),
			featureId: "messages",
			internalFeatureId: "feat_messages",
			requiredBalance,
			properties,
			occurredAt: at,
		},
	});

const balanceIn = (reply: CheckReply) =>
	reply.state.customerEntitlements.reduce((sum, row) => sum + row.balance, 0);

describe("check reply memo", () => {
	test("an identical check in the same second reuses the reply", async () => {
		const processor = await createProcessor();
		const first = await processor.check({ command: checkOf() });
		const again = await processor.check({
			command: checkOf({ at: SECOND_START + 900 }),
		});
		expect(again).toBe(first);
		expect(processor.readCounters()).toMatchObject({
			checkMemoHits: 1,
			checkMemoMisses: 1,
		});
	});

	test("a write replaces the state, so the next check answers from the new balance", async () => {
		const processor = await createProcessor();
		const before = await processor.check({ command: checkOf() });
		await processor.track({
			command: createTrackCommand({
				identity: identityOf({ customerId: "cus_1" }),
				commandId: "t1",
				value: 7,
				occurredAt: SECOND_START,
			}),
		});
		const after = await processor.check({ command: checkOf() });
		expect(after).not.toBe(before);
		expect(balanceIn(after)).toBe(balanceIn(before) - 7);
	});

	test("the next second, another required balance, or event properties each decide afresh", async () => {
		const processor = await createProcessor();
		const first = await processor.check({ command: checkOf() });
		const nextSecond = await processor.check({
			command: checkOf({ at: SECOND_START + 1_000 }),
		});
		expect(nextSecond).not.toBe(first);
		const tooMuch = await processor.check({
			command: checkOf({ at: SECOND_START + 1_000, requiredBalance: 5_000 }),
		});
		expect(tooMuch.result.allowed).toBe(false);
		expect(nextSecond.result.allowed).toBe(true);
		const withProperties = checkOf({ properties: { model: "large" } });
		const firstWithProperties = await processor.check({
			command: withProperties,
		});
		expect(await processor.check({ command: withProperties })).not.toBe(
			firstWithProperties,
		);
		expect(processor.readCounters()).toMatchObject({
			checkMemoHits: 0,
			checkMemoMisses: 3,
			checkMemoBypassed: 2,
		});
	});

	test("a reset that falls due inside the second advances before the memo is read", async () => {
		const processor = await createProcessor({
			states: [
				createState({
					identity: identityOf({ customerId: "cus_reset" }),
					customerEntitlements: [
						{
							...createCustomerEntitlement({ balance: 3 }),
							next_reset_at: SECOND_START + 500,
						},
					],
				}),
			],
		});
		const beforeReset = await processor.check({
			command: checkOf({
				customerId: "cus_reset",
				at: SECOND_START + 100,
				requiredBalance: 5,
			}),
		});
		expect(beforeReset.result.allowed).toBe(false);
		const afterReset = await processor.check({
			command: checkOf({
				customerId: "cus_reset",
				at: SECOND_START + 600,
				requiredBalance: 5,
			}),
		});
		expect(afterReset.result.allowed).toBe(true);
	});
});
