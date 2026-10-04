/**
 * A check reply carries a lease only while a second of tracks at ten times the observed draw rate could not
 * refuse it: allowed, unguarded, and ending no later than the rows' next reset or expiry.
 */

import { describe, expect, test } from "bun:test";
import {
	type CheckCommand,
	parseCheckCommand,
	type SubjectState,
	type WorkerCustomerEntitlement,
} from "@autumn/balance-engine";
import type { PartitionProcessorConfig } from "../../../src/processor/types/partitionProcessor.js";
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
const identity = residentIdentityOf({ customerId: "cus_1" });

const processorWith = ({
	customerEntitlements,
	balance = 1_000,
	config,
}: {
	customerEntitlements?: WorkerCustomerEntitlement[];
	balance?: number;
	config?: Partial<PartitionProcessorConfig>;
} = {}) =>
	createResidentProcessor({
		states: [
			createState({ identity, balance, customerEntitlements }) as SubjectState,
		],
		config,
	});

/** An owner that has watched the partition's draws for longer than the warm-up. */
const warmProcessorWith = async (
	params: Parameters<typeof processorWith>[0] = {},
) => {
	const processor = await processorWith(params);
	await processor.check({ command: checkOf({ at: SECOND_START - 10_000 }) });
	return processor;
};

const checkOf = ({
	at = SECOND_START,
	requiredBalance = 1,
	properties = null,
}: {
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
			identity,
			featureId: "messages",
			internalFeatureId: "feat_messages",
			requiredBalance,
			properties,
			occurredAt: at,
		},
	});

let commandIds = 0;
const trackAt = async ({
	processor,
	at,
	value,
}: {
	processor: Awaited<ReturnType<typeof processorWith>>;
	at: number;
	value: number;
}) =>
	processor.track({
		command: createTrackCommand({
			identity,
			commandId: `t${++commandIds}`,
			value,
			occurredAt: at,
		}),
	});

describe("check leases on the owner", () => {
	test("a quiet balance with room leases for the full second", async () => {
		const processor = await warmProcessorWith();
		const reply = await processor.check({ command: checkOf() });
		expect(reply.lease).toEqual({ expiresAt: SECOND_START + 1_000 });
		// A memo hit is the same reply, so the lease keeps the deciding check's clock.
		const again = await processor.check({
			command: checkOf({ at: SECOND_START + 600 }),
		});
		expect(again.lease).toEqual({ expiresAt: SECOND_START + 1_000 });
		// The warm-up check before it was withheld: a new owner has no draw rate to gate on.
		expect(processor.readCounters()).toMatchObject({
			checkLeasesIssued: 1,
			checkLeasesWithheld: 1,
		});
	});

	test("a new owner leases only what no draw can refuse until it has watched the draws", async () => {
		const quiet = await processorWith();
		expect((await quiet.check({ command: checkOf() })).lease).toBeNull();
		const overage = await processorWith({
			customerEntitlements: [
				{ ...createCustomerEntitlement({ balance: 0 }), usage_allowed: true },
			],
		});
		expect((await overage.check({ command: checkOf() })).lease).toEqual({
			expiresAt: SECOND_START + 1_000,
		});
		expect(
			(await quiet.check({ command: checkOf({ at: SECOND_START + 2_000 }) }))
				.lease,
		).toEqual({ expiresAt: SECOND_START + 3_000 });
	});

	test("near the limit there is no lease: the headroom must cover ten times a second of draws", async () => {
		const processor = await warmProcessorWith({ balance: 30 });
		await trackAt({ processor, at: SECOND_START, value: 2 });
		// 28 left; the draw rate is ~2 units/s, so a lease needs 1 + 20 fundable.
		const roomy = await processor.check({
			command: checkOf({ at: SECOND_START + 1 }),
		});
		expect(roomy.result.allowed).toBe(true);
		expect(roomy.lease).not.toBeNull();
		await trackAt({ processor, at: SECOND_START + 2, value: 10 });
		// 18 left; ~12 units/s needs 121 fundable: still allowed, but no longer leased.
		const tight = await processor.check({
			command: checkOf({ at: SECOND_START + 3 }),
		});
		expect(tight.result.allowed).toBe(true);
		expect(tight.lease).toBeNull();
	});

	test("the draw rate decays: a burst seconds ago no longer holds a lease back", async () => {
		const processor = await warmProcessorWith({ balance: 200 });
		await trackAt({ processor, at: SECOND_START, value: 50 });
		const during = await processor.check({
			command: checkOf({ at: SECOND_START + 1 }),
		});
		expect(during.lease).toBeNull();
		const later = await processor.check({
			command: checkOf({ at: SECOND_START + 10_000 }),
		});
		expect(later.lease).toEqual({ expiresAt: SECOND_START + 11_000 });
	});

	test("overage rows lease whatever the draw rate: no track can refuse the check", async () => {
		const processor = await warmProcessorWith({
			customerEntitlements: [
				{ ...createCustomerEntitlement({ balance: 0 }), usage_allowed: true },
			],
		});
		const drawn = await trackAt({ processor, at: SECOND_START, value: 500 });
		expect(drawn.result.status).toBe("applied");
		const reply = await processor.check({
			command: checkOf({ at: SECOND_START + 1 }),
		});
		expect(reply.result.allowed).toBe(true);
		expect(reply.lease).toEqual({ expiresAt: SECOND_START + 1_001 });
	});

	test("the lease ends at the rows' next reset or grant expiry", async () => {
		const resets = await warmProcessorWith({
			customerEntitlements: [
				{
					...createCustomerEntitlement({ balance: 100 }),
					next_reset_at: SECOND_START + 300,
				},
			],
		});
		expect((await resets.check({ command: checkOf() })).lease).toEqual({
			expiresAt: SECOND_START + 300,
		});
		const expires = await warmProcessorWith({
			customerEntitlements: [
				{
					...createCustomerEntitlement({ balance: 100 }),
					expires_at: SECOND_START + 200,
				},
			],
		});
		expect((await expires.check({ command: checkOf() })).lease).toEqual({
			expiresAt: SECOND_START + 200,
		});
	});

	test("refused answers, event properties and a disabled owner never lease", async () => {
		const processor = await warmProcessorWith({ balance: 5 });
		const refused = await processor.check({
			command: checkOf({ requiredBalance: 10 }),
		});
		expect(refused.result.allowed).toBe(false);
		expect(refused.lease).toBeNull();
		const withProperties = await processor.check({
			command: checkOf({ properties: { model: "large" } }),
		});
		expect(withProperties.result.allowed).toBe(true);
		expect(withProperties.lease).toBeNull();
		expect(processor.readCounters()).toMatchObject({
			checkLeasesIssued: 0,
			checkLeasesWithheld: 3,
		});

		const disabled = await processorWith({
			config: { issuesCheckLeases: false },
		});
		expect((await disabled.check({ command: checkOf() })).lease).toBeNull();
	});
});
