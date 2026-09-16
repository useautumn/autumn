import { describe, expect, test } from "bun:test";
import { computeInitialize } from "../../../../src/balanceEngine.js";
import {
	createCustomerEntitlement,
	createInitializeCommand,
	createState,
	deduplicationExpiresAt,
	identity,
} from "../../engineFixtures.js";

const initializeMutation = ({
	command = createInitializeCommand(),
}: {
	command?: ReturnType<typeof createInitializeCommand>;
} = {}) => computeInitialize({ command, deduplicationExpiresAt });

describe("initialization computation", () => {
	test.concurrent("inserts every row as the first revision", () => {
		const customerEntitlements = [
			createCustomerEntitlement({ id: "messages_monthly" }),
			createCustomerEntitlement({
				id: "credits_monthly",
				featureId: "credits",
			}),
		];
		const mutation = initializeMutation({
			command: createInitializeCommand({
				state: createState({ customerEntitlements }),
			}),
		});

		expect(mutation).toMatchObject({
			id: "init_1",
			identity,
			revision: { before: 0, after: 1 },
			command: { type: "initialize" },
			result: { type: "initialize" },
			receipt: { expiresAt: deduplicationExpiresAt },
		});
		expect(mutation.changes).toEqual([
			{
				table: "customerEntitlements",
				op: "insert",
				row: createCustomerEntitlement({
					id: "credits_monthly",
					featureId: "credits",
				}),
			},
			{
				table: "customerEntitlements",
				op: "insert",
				row: createCustomerEntitlement({ id: "messages_monthly" }),
			},
		]);
	});

	test.concurrent("fingerprints the rows, not the request envelope", () => {
		const customerEntitlements = [
			createCustomerEntitlement({ id: "messages_monthly" }),
			createCustomerEntitlement({
				id: "credits_monthly",
				featureId: "credits",
			}),
		];
		const mutation = initializeMutation({
			command: createInitializeCommand({
				state: createState({ customerEntitlements }),
			}),
		});
		const reorderedMutation = initializeMutation({
			command: createInitializeCommand({
				requestId: "req_init_retry",
				state: createState({
					customerEntitlements: [...customerEntitlements].reverse(),
				}),
			}),
		});
		const changedMutation = initializeMutation({
			command: createInitializeCommand({
				state: createState({ balance: 11 }),
			}),
		});

		expect(reorderedMutation.receipt.fingerprint).toBe(
			mutation.receipt.fingerprint,
		);
		expect(changedMutation.receipt.fingerprint).not.toBe(
			mutation.receipt.fingerprint,
		);
	});
});
