import { describe, expect, test } from "bun:test";
import {
	computeInitialize,
	initializeCommandToFingerprint,
	parseInitializeCommand,
} from "../../../../src/balanceEngine.js";
import {
	createCustomerEntitlement,
	createCustomerProduct,
	createEntityState,
	createInitializeCommand,
	createState,
	deduplicationExpiresAt,
	entity,
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
			{ table: "customerProducts", op: "insert", row: createCustomerProduct() },
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

	test.concurrent(
		"an entity initialize joins the customer's log at its current revision",
		() => {
			const command = createInitializeCommand({ state: createEntityState() });
			const mutation = computeInitialize({
				command,
				revisionBefore: 7,
				deduplicationExpiresAt,
			});

			expect(mutation).toMatchObject({
				identity: { ...identity, entityId: entity.id },
				revision: { before: 7, after: 8 },
			});
			expect(mutation.command).toMatchObject({ type: "initialize", entity });
			expect(mutation.changes.map((change) => change.table)).toEqual([
				"customerEntitlements",
			]);
			expect(initializeCommandToFingerprint({ command })).toBe(
				mutation.receipt.fingerprint,
			);
		},
	);

	test.concurrent(
		"refuses rows that do not belong to the initialized subject",
		() => {
			const entityRow = {
				...createCustomerEntitlement({
					id: "seats_ent_42",
					featureId: "seats",
				}),
				internal_entity_id: entity.internal_id,
			};
			const asInput = (state: ReturnType<typeof createState>) => ({
				...createInitializeCommand(),
				identity: state.identity,
				state,
			});

			expect(() =>
				parseInitializeCommand({
					input: asInput(createState({ customerEntitlements: [entityRow] })),
				}),
			).toThrow();
			expect(() =>
				parseInitializeCommand({
					input: asInput({ ...createState(), entity }),
				}),
			).toThrow();
			expect(() =>
				parseInitializeCommand({
					input: asInput({ ...createEntityState(), entity: null }),
				}),
			).toThrow();
			expect(() =>
				parseInitializeCommand({
					input: asInput(
						createEntityState({
							customerEntitlements: [createCustomerEntitlement()],
						}),
					),
				}),
			).toThrow();
			expect(() =>
				computeInitialize({
					command: createInitializeCommand(),
					revisionBefore: 3,
					deduplicationExpiresAt,
				}),
			).toThrow();
		},
	);
});
