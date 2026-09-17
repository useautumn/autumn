import { describe, expect, test } from "bun:test";
import {
	computeInitialize,
	parseInitializeRequest,
} from "../../../../src/balanceEngine.js";
import {
	createCustomerEntitlement,
	createCustomerProduct,
	createEntityState,
	createInitializeRequest,
	createState,
	entity,
	identity,
} from "../../engineFixtures.js";

const initializeMutation = ({
	request = createInitializeRequest(),
}: {
	request?: ReturnType<typeof createInitializeRequest>;
} = {}) => computeInitialize(request);

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
			request: createInitializeRequest({
				state: createState({ customerEntitlements }),
			}),
		});

		expect(mutation).toMatchObject({
			id: "init_1",
			identity,
			revision: { before: 0, after: 1 },
			command: { type: "initialize" },
			result: { type: "initialize" },
		});
		expect(mutation.changes).toEqual([
			{ table: "customer", op: "insert", row: createState().customer },
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
			request: createInitializeRequest({
				state: createState({ customerEntitlements }),
			}),
		});
		const reorderedMutation = initializeMutation({
			request: createInitializeRequest({
				requestId: "req_init_retry",
				state: createState({
					customerEntitlements: [...customerEntitlements].reverse(),
				}),
			}),
		});
		const changedMutation = initializeMutation({
			request: createInitializeRequest({
				state: createState({ balance: 11 }),
			}),
		});

		expect(reorderedMutation.changes).toEqual(mutation.changes);
		expect(changedMutation.changes).not.toEqual(mutation.changes);
	});

	test.concurrent(
		"an entity initialize joins the customer's log at its current revision",
		() => {
			const request = createInitializeRequest({ state: createEntityState() });
			const mutation = computeInitialize({ ...request, revisionBefore: 7 });

			expect(mutation).toMatchObject({
				identity: { ...identity, entityId: entity.id },
				revision: { before: 7, after: 8 },
			});
			expect(mutation.command).toMatchObject({ type: "initialize" });
			expect(mutation.changes.map((change) => change.table)).toEqual([
				"customer",
				"entity",
				"customerEntitlements",
			]);
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
			const asInput = (state: ReturnType<typeof createState>) => {
				const request = createInitializeRequest();
				return {
					...request,
					command: { ...request.command, identity: state.identity },
					state,
				};
			};

			expect(() =>
				parseInitializeRequest({
					input: asInput(createState({ customerEntitlements: [entityRow] })),
				}),
			).toThrow();
			expect(() =>
				parseInitializeRequest({
					input: asInput({ ...createState(), entity }),
				}),
			).toThrow();
			expect(() =>
				parseInitializeRequest({
					input: asInput({ ...createEntityState(), entity: null }),
				}),
			).toThrow();
			expect(() =>
				parseInitializeRequest({
					input: asInput(
						createEntityState({
							customerEntitlements: [createCustomerEntitlement()],
						}),
					),
				}),
			).toThrow();
			expect(() =>
				computeInitialize({ ...createInitializeRequest(), revisionBefore: 3 }),
			).toThrow();
		},
	);
});
