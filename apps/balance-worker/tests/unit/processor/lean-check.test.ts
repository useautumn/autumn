/**
 * The hot check (serial-decide arm D) is the classic check without the asynchronous read: same bytes, same
 * memo, same lease, and it steps aside whenever the classic path would have to hydrate or advance first.
 */
import { describe, expect, test } from "bun:test";
import { type CheckCommand, parseCheckCommand } from "@autumn/balance-engine";
import { serializeCheckReply } from "../../../src/http/replies/serializeSubjectReply.js";
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

const SECOND_START = 1_700_000_000_000;
const cus1 = residentIdentityOf({ customerId: "cus_1" });

const checkOf = ({
	customerId = "cus_1",
	at = SECOND_START,
	requiredBalance = 1,
}: {
	customerId?: string;
	at?: number;
	requiredBalance?: number;
} = {}): CheckCommand =>
	parseCheckCommand({
		input: {
			schemaVersion: 1,
			type: "check",
			org: testOrg,
			requestId: `req_${at}_${requiredBalance}`,
			identity: residentIdentityOf({ customerId }),
			featureId: "messages",
			internalFeatureId: "feat_messages",
			requiredBalance,
			properties: null,
			occurredAt: at,
		},
	});

/** Two processors over the same rows: one answers the classic way, the other on the hot path. */
async function twins({ balance = 100 }: { balance?: number } = {}) {
	const [classic, hot] = await Promise.all([
		createResidentProcessor({
			states: [createState({ identity: cus1, balance })],
		}),
		createResidentProcessor({
			states: [createState({ identity: cus1, balance })],
		}),
	]);
	return { classic, hot };
}

describe("lean check (serial-decide arm D)", () => {
	test("a hot check answers the same bytes as the classic check, decided fresh or from the memo, and issues the same lease", async () => {
		const { classic, hot } = await twins();
		const command = checkOf();
		const classicBytes = serializeCheckReply({
			reply: await classic.check({ command }),
		});
		const outcome = hot.checkHot({ command });
		expect(outcome?.status).toBe(200);
		expect(outcome?.seq).toBe(0);
		expect(outcome?.body).toBe(classicBytes);
		expect(outcome?.reply.lease).toEqual(
			(await classic.check({ command })).lease,
		);
		// The hot decision fills the same memo the classic check reads from, and counts the same way.
		const again = checkOf({ at: SECOND_START + 500 });
		expect(
			serializeCheckReply({ reply: await hot.check({ command: again }) }),
		).toBe(classicBytes);
		expect(hot.readCounters()).toMatchObject({
			checkMemoMisses: 1,
			checkMemoHits: 1,
		});
		expect(hot.readCounters()).toEqual(classic.readCounters());
	});

	test("a hot check after a hot track reads the projected balance, exactly as the classic check does after a classic track", async () => {
		const { classic, hot } = await twins();
		const track = createTrackCommand({
			identity: cus1,
			commandId: "cmd_1",
			value: 7,
			occurredAt: SECOND_START,
		});
		await classic.track({ command: track });
		expect(hot.trackHot({ command: track })?.seq).toBeGreaterThan(0);
		const command = checkOf({ at: SECOND_START + 10 });
		const classicReply = await classic.check({ command });
		const outcome = hot.checkHot({ command });
		expect(outcome?.body).toBe(serializeCheckReply({ reply: classicReply }));
		expect(outcome?.reply.state.customerEntitlements[0]?.balance).toBe(93);
		expect(outcome?.reply.result.allowed).toBe(classicReply.result.allowed);
	});

	test("a check leaves the hot path when the customer is not resident or a reset is due, and the classic check still answers it", async () => {
		const { hot } = await twins();
		expect(
			hot.checkHot({ command: checkOf({ customerId: "cus_other" }) }),
		).toBe(null);
		const due = await createResidentProcessor({
			states: [
				createState({
					identity: residentIdentityOf({ customerId: "cus_due" }),
					customerEntitlements: [
						{
							...createCustomerEntitlement({ balance: 5 }),
							next_reset_at: SECOND_START - 1,
							reset_cycle_anchor: SECOND_START - 1,
						},
					],
				}),
			],
		});
		const command = checkOf({ customerId: "cus_due" });
		expect(due.checkHot({ command })).toBe(null);
		expect((await due.check({ command })).result.allowed).toBe(true);
	});
});
