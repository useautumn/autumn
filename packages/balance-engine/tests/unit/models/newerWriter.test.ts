import { beforeEach, describe, expect, test } from "bun:test";
import {
	onUnknownInput,
	parseApplyBillingPlanRequest,
	parseCatalog,
	parseCheckCommand,
	parseConfirmExpiredLockCommand,
	parseDeleteBalanceCommand,
	parseEvictCommand,
	parseFinalizeCommand,
	parseFlushCommand,
	parseInitializeRequest,
	parseReadSubjectStateCommand,
	parseRecalculateBalanceCommand,
	parseResetCommand,
	parseSubjectState,
	parseTrackCommand,
	parseUpdateBalanceCommand,
	type UnknownInput,
} from "../../../src/balanceEngine.js";
import {
	createCatalogFor,
	createCheckCommand,
	createDeleteBalanceCommand,
	createInitializeRequest,
	createRecalculateBalanceCommand,
	createState,
	createTrackCommand,
	createUpdateBalanceCommand,
	identity,
	occurredAt,
	org,
} from "../engineFixtures.js";

/** As JSON leaves a newer writer: the same value, plus one field this build does not know. */
const fromNewerWriter = <T>(value: T): T & { futureField: true } => ({
	...JSON.parse(JSON.stringify(value)),
	futureField: true,
});

const base = {
	schemaVersion: 1,
	requestId: "req_1",
	commandId: "cmd_1",
	identity,
	occurredAt,
};

const lock = {
	id: "lock_row_1",
	org_id: identity.orgId,
	env: identity.env,
	lock_id: "lock_1",
	internal_customer_id: "cus_internal_1",
	customer_id: identity.customerId,
	entity_id: null,
	feature_id: "messages",
	overage_behavior: "reject",
	properties: null,
	deltas: [],
	expires_at: occurredAt + 1,
	expiry_action: "release",
	created_at: occurredAt,
};

const commands: Record<
	string,
	{ parse: (params: { input: unknown }) => unknown; input: unknown }
> = {
	check: { parse: parseCheckCommand, input: createCheckCommand() },
	updateBalance: {
		parse: parseUpdateBalanceCommand,
		input: createUpdateBalanceCommand(),
	},
	deleteBalance: {
		parse: parseDeleteBalanceCommand,
		input: createDeleteBalanceCommand(),
	},
	recalculateBalance: {
		parse: parseRecalculateBalanceCommand,
		input: createRecalculateBalanceCommand(),
	},
	initialize: {
		parse: parseInitializeRequest,
		input: createInitializeRequest(),
	},
	applyBillingPlan: {
		parse: parseApplyBillingPlanRequest,
		input: {
			command: {
				...base,
				type: "applyBillingPlan",
				org,
				entityIds: [],
				ops: [{ op: "delete", table: "customerPrices", id: "cp_price_1" }],
				expiringPooledBalanceIds: [],
			},
			catalogRows: [],
		},
	},
	reset: { parse: parseResetCommand, input: { ...base, type: "reset", org } },
	finalize: {
		parse: parseFinalizeCommand,
		input: {
			...base,
			type: "finalize",
			org,
			lock,
			internalFeatureId: "feat_messages",
			finalValue: 3,
			properties: null,
		},
	},
	confirmExpiredLock: {
		parse: parseConfirmExpiredLockCommand,
		input: {
			...base,
			type: "confirmExpiredLock",
			lock: { id: lock.id, lock_id: lock.lock_id },
		},
	},
	evict: { parse: parseEvictCommand, input: { ...base, type: "evict" } },
	flush: { parse: parseFlushCommand, input: { ...base, type: "flush" } },
	readSubjectState: {
		parse: parseReadSubjectStateCommand,
		input: { ...base, type: "readSubjectState", org },
	},
};

describe("a command from a newer server", () => {
	for (const [type, { parse, input }] of Object.entries(commands)) {
		test(`${type} keeps a field this build does not know`, () => {
			expect(parse({ input: fromNewerWriter(input) })).toEqual({
				...(parse({ input }) as object),
				futureField: true,
			});
		});
	}

	test("track accepts an overage behaviour and a lock expiry action this build does not know", () => {
		const command = {
			...createTrackCommand(),
			overageBehavior: "future_behaviour",
			lock: {
				id: "lock_row_1",
				lockId: "lock_1",
				expiresAt: occurredAt + 1,
				expiryAction: "future_action",
			},
		};

		expect<unknown>(parseTrackCommand({ input: command })).toEqual(command);
	});

	test("a field of a known name with the wrong type is still refused", () => {
		expect(() =>
			parseCheckCommand({ input: { ...createCheckCommand(), featureId: 5 } }),
		).toThrow();
	});
});

describe("a subject state from a newer worker", () => {
	const sightings: UnknownInput[] = [];
	beforeEach(() => {
		sightings.length = 0;
		onUnknownInput((input) => sightings.push(input));
	});

	/** Each test picks its own values, so what counts as a first sighting does not depend on test order. */
	const newerState = ({
		apiSemver,
		status,
	}: {
		apiSemver: string;
		status: string;
	}) => {
		const state = JSON.parse(JSON.stringify(createState()));
		state.futureField = true;
		state.customerProducts[0].api_semver = apiSemver;
		state.customerProducts[0].status = status;
		state.customerProducts[0].futureColumn = "kept";
		state.customer.futureColumn = "kept";
		return state;
	};

	test("keeps an unknown field, an unknown column and an unknown enum value", () => {
		const state = newerState({ apiSemver: "9.8.0", status: "future_status_a" });

		expect(parseSubjectState({ input: state })).toEqual(state);
	});

	test("reports each unknown enum value once per process, however often it is read", () => {
		const state = newerState({ apiSemver: "9.9.0", status: "future_status_b" });
		parseSubjectState({ input: state });
		parseSubjectState({ input: state });
		parseSubjectState({ input: { ...state, revision: 7 } });

		// api_semver is a plain string on the row, so a new API version is not a sighting at all.
		expect(sightings).toEqual([
			{
				kind: "enum_value",
				schema: "workerCustomerProduct.status",
				value: "future_status_b",
			},
		]);
	});

	test("a known enum value is not reported", () => {
		parseSubjectState({ input: createState() });

		expect(sightings).toEqual([]);
	});

	test("a column of a known name with the wrong type is still refused", () => {
		const state = createState();
		state.customerEntitlements[0] = {
			...state.customerEntitlements[0],
			balance: "5" as unknown as number,
		};

		expect(() => parseSubjectState({ input: state })).toThrow();
	});
});

describe("a catalog from a newer server", () => {
	test("keeps an unknown column and an unknown feature type on its rows", () => {
		const catalog = createCatalogFor({ state: createState() });
		const [featureId, feature] = Object.entries(catalog.features)[0] ?? [];
		if (!featureId || !feature) throw new Error("fixture has no feature");
		const withFeature = (type: string, extra: object) => ({
			...catalog,
			features: {
				...catalog.features,
				[featureId]: { ...feature, type, ...extra },
			},
		});

		const parsed = parseCatalog({
			input: withFeature("future_type", { futureColumn: 1 }),
		});

		expect(parsed.features[featureId]).toEqual({
			...parseCatalog({ input: catalog }).features[featureId],
			type: "future_type",
			futureColumn: 1,
		} as unknown as (typeof parsed.features)[string]);
	});
});
