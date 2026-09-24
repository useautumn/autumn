import { describe, expect, test } from "bun:test";
import {
	applyMutation,
	type Catalog,
	computeFinalize,
	computeTrack,
	createSubjectState,
	type SubjectState,
	type SubjectStateMutation,
	subjectStateToFullSubject,
	type WorkerCustomer,
	type WorkerCustomerEntitlement,
	type WorkerEntity,
	type WorkerFullSubject,
} from "@autumn/balance-engine";
import { type DbUsageAlert, ResetInterval } from "@autumn/shared";
import { customerWith } from "../../../balance-engine/tests/unit/deduction/deductionFixtures.js";
import {
	createCatalogFor,
	createCustomerEntitlement,
	createCustomerProduct,
	createTrackCommand,
	entity,
	identity,
	occurredAt,
} from "../../../balance-engine/tests/unit/engineFixtures.js";
import { subjectsToBalanceWebhooks } from "../../src/balanceWebhooks.js";

/**
 * The usage-alert matrix: which alerts a track considers (customer, plan, entity, org) for a customer
 * track and for an entity track, what each is measured on, and when a threshold counts as crossed.
 * Every case is what prod's checkUsageAlerts decides; see plans/herald/usage-alerts-matrix.md.
 */

const ENTITY_FEATURE_ID = "seats";
const OTHER_ENTITY_ID = "ent_07";

const alert = (overrides: Partial<DbUsageAlert> = {}): DbUsageAlert => ({
	feature_id: "messages",
	enabled: true,
	threshold: 80,
	threshold_type: "usage_percentage",
	basis: "balance",
	...overrides,
});

const customerOf = ({
	alerts = [],
	usageLimits,
}: {
	alerts?: DbUsageAlert[];
	usageLimits?: WorkerCustomer["usage_limits"];
} = {}): WorkerCustomer => ({
	...customerWith(usageLimits ? { usage_limits: usageLimits } : {}),
	usage_alerts: alerts,
});

const entityOf = ({
	alerts = [],
}: {
	alerts?: DbUsageAlert[];
} = {}): WorkerEntity => ({
	...entity,
	spend_limits: null,
	overage_allowed: null,
	usage_limits: null,
	usage_alerts: alerts,
});

/** A customer-level row whose balance lives per entity: the tracked entity draws its own key. */
const perEntityRow = ({
	balances = { [OTHER_ENTITY_ID]: 10, [entity.id]: 10 },
}: {
	balances?: Record<string, number>;
} = {}): WorkerCustomerEntitlement => ({
	...createCustomerEntitlement({ id: "messages_per_entity" }),
	balance: 0,
	entities: Object.fromEntries(
		Object.entries(balances).map(([entityId, balance]) => [
			entityId,
			{ id: entityId, balance, adjustment: 0 },
		]),
	),
});

const catalogOf = ({
	state,
	planAlerts,
	perEntity = false,
}: {
	state: SubjectState;
	planAlerts?: DbUsageAlert[];
	perEntity?: boolean;
}): Catalog => {
	const catalog = createCatalogFor({ state });
	for (const entitlement of Object.values(catalog.entitlements)) {
		entitlement.allowance = 10;
		if (perEntity) entitlement.entity_feature_id = ENTITY_FEATURE_ID;
	}
	for (const product of Object.values(catalog.products)) {
		product.usage_alerts = planAlerts ?? null;
	}
	return catalog;
};

/** What the worker hands the decision: the mutation with the subject as it found it and as it left it. */
type DecidedOn = {
	mutation: SubjectStateMutation;
	before: WorkerFullSubject;
	after: WorkerFullSubject;
};

/** Tracks `value` and returns what the worker decides effects over. */
const trackOn = ({
	customer = customerOf(),
	customerEntitlements = [createCustomerEntitlement({ balance: 10 })],
	withEntity,
	planAlerts,
	orgAlerts = {},
	value,
	trackEntity = false,
	properties = null,
}: {
	customer?: WorkerCustomer;
	customerEntitlements?: WorkerCustomerEntitlement[];
	withEntity?: WorkerEntity;
	planAlerts?: DbUsageAlert[];
	orgAlerts?: { sandbox?: DbUsageAlert[]; live?: DbUsageAlert[] };
	value: number;
	trackEntity?: boolean;
	properties?: Record<string, unknown> | null;
}): DecidedOn => {
	const state = createSubjectState({
		identity,
		customer,
		entity: withEntity,
		customerProducts: [createCustomerProduct()],
		customerEntitlements,
	});
	const catalog = catalogOf({
		state,
		planAlerts,
		perEntity: Boolean(withEntity),
	});
	const entityId = trackEntity ? entity.id : null;
	const command = {
		...createTrackCommand({
			value,
			overageBehavior: "cap",
			entityId,
			properties,
		}),
		org: {
			...createTrackCommand().org,
			id: identity.orgId,
			config: {
				...createTrackCommand().org.config,
				usage_alerts: orgAlerts.live,
				sandbox_usage_alerts: orgAlerts.sandbox,
			},
		},
	};
	const mutation = computeTrack({
		fullSubject: subjectStateToFullSubject({ state, catalog, entityId }),
		command,
	});
	return {
		mutation,
		before: subjectStateToFullSubject({ state, catalog, entityId }),
		after: subjectStateToFullSubject({
			state: applyMutation({ state, mutation }),
			catalog,
			entityId,
		}),
	};
};

const usageAlertsOf = (decided: DecidedOn) =>
	subjectsToBalanceWebhooks(decided).filter(
		({ eventType }) => eventType === "balances.usage_alert_triggered",
	);

const dataOf = (decided: DecidedOn) =>
	usageAlertsOf(decided).map(({ data }) => data as Record<string, unknown>);

describe("a customer alert on a customer track", () => {
	test("fires once the usage crosses the threshold, naming the customer and the feature", () => {
		const [data] = dataOf(
			trackOn({ customer: customerOf({ alerts: [alert()] }), value: 8 }),
		);

		expect(data).toEqual({
			customer_id: identity.customerId,
			feature_id: "messages",
			usage_alert: {
				name: undefined,
				threshold: 80,
				threshold_type: "usage_percentage",
				basis: "balance",
			},
			balance: { usage: 8, granted: 10, included: 10, remaining: 2 },
		});
	});

	test("does not fire below the threshold", () => {
		expect(
			usageAlertsOf(
				trackOn({ customer: customerOf({ alerts: [alert()] }), value: 7 }),
			),
		).toEqual([]);
	});

	test("does not fire again once already past it", () => {
		expect(
			usageAlertsOf(
				trackOn({
					customer: customerOf({ alerts: [alert()] }),
					customerEntitlements: [createCustomerEntitlement({ balance: 1 })],
					value: 1,
				}),
			),
		).toEqual([]);
	});

	test("a disabled alert never fires", () => {
		expect(
			usageAlertsOf(
				trackOn({
					customer: customerOf({ alerts: [alert({ enabled: false })] }),
					value: 10,
				}),
			),
		).toEqual([]);
	});

	test("every threshold type reads the balance its own way", () => {
		const fired = (overrides: Partial<DbUsageAlert>, value: number) =>
			usageAlertsOf(
				trackOn({
					customer: customerOf({ alerts: [alert(overrides)] }),
					value,
				}),
			).length;

		expect(fired({ threshold_type: "usage", threshold: 5 }, 5)).toBe(1);
		expect(fired({ threshold_type: "usage", threshold: 5 }, 4)).toBe(0);
		expect(fired({ threshold_type: "remaining", threshold: 3 }, 7)).toBe(1);
		expect(fired({ threshold_type: "remaining", threshold: 3 }, 6)).toBe(0);
		expect(
			fired({ threshold_type: "remaining_percentage", threshold: 20 }, 8),
		).toBe(1);
		expect(
			fired({ threshold_type: "remaining_percentage", threshold: 20 }, 7),
		).toBe(0);
	});

	test("two alerts crossed by one track both fire", () => {
		const data = dataOf(
			trackOn({
				customer: customerOf({
					alerts: [alert({ threshold: 50 }), alert({ threshold: 80 })],
				}),
				value: 9,
			}),
		);

		expect(
			data.map((row) => (row.usage_alert as { threshold: number }).threshold),
		).toEqual([50, 80]);
	});
});

describe("plan alerts at customer scope", () => {
	test("the plan's alert is used when the customer has none for the feature", () => {
		const data = dataOf(trackOn({ planAlerts: [alert()], value: 8 }));

		expect(data).toHaveLength(1);
		expect(data[0]?.customer_id).toBe(identity.customerId);
	});

	test("a customer alert shadows the plan's; they never merge", () => {
		const data = dataOf(
			trackOn({
				customer: customerOf({ alerts: [alert({ threshold: 90 })] }),
				planAlerts: [alert({ threshold: 50 })],
				value: 8,
			}),
		);

		expect(data).toEqual([]);
	});
});

describe("an entity track", () => {
	const entityAlert = () => alert({ threshold_type: "usage", threshold: 4 });

	test("fires the tracked entity's own alert, naming the entity", () => {
		const data = dataOf(
			trackOn({
				customerEntitlements: [perEntityRow()],
				withEntity: entityOf({ alerts: [entityAlert()] }),
				value: 4,
				trackEntity: true,
			}),
		);

		expect(data).toHaveLength(1);
		expect(data[0]).toMatchObject({
			customer_id: identity.customerId,
			entity_id: entity.id,
			feature_id: "messages",
			balance: { usage: 4, remaining: 6 },
		});
	});

	test("a customer alert on an entity track measures the customer's balance, and names no entity", () => {
		const data = dataOf(
			trackOn({
				customer: customerOf({
					alerts: [alert({ threshold_type: "usage", threshold: 4 })],
				}),
				customerEntitlements: [perEntityRow()],
				withEntity: entityOf(),
				value: 4,
				trackEntity: true,
			}),
		);

		expect(data).toHaveLength(1);
		expect(data[0]).not.toHaveProperty("entity_id");
		expect(data[0]?.balance).toMatchObject({ usage: 4, granted: 20 });
	});

	test("customer, entity and org alerts all fire, each on its own balance", () => {
		const data = dataOf(
			trackOn({
				customer: customerOf({
					alerts: [alert({ threshold_type: "usage", threshold: 4 })],
				}),
				customerEntitlements: [perEntityRow()],
				withEntity: entityOf({ alerts: [entityAlert()] }),
				orgAlerts: {
					sandbox: [alert({ threshold_type: "usage", threshold: 4 })],
				},
				value: 4,
				trackEntity: true,
			}),
		);

		expect(data.map((row) => row.entity_id ?? "customer")).toEqual([
			"customer",
			entity.id,
			entity.id,
		]);
	});

	test("the webhook's tags name the tracked entity even for a customer-scope alert", () => {
		const [webhook] = usageAlertsOf(
			trackOn({
				customer: customerOf({
					alerts: [alert({ threshold_type: "usage", threshold: 4 })],
				}),
				customerEntitlements: [perEntityRow()],
				withEntity: entityOf(),
				value: 4,
				trackEntity: true,
			}),
		);

		expect(webhook?.tags).toEqual([
			`customer_id.${identity.customerId}`,
			`entity_id.${entity.id}`,
		]);
	});
});

describe("a customer track", () => {
	test("never considers an entity's alerts", () => {
		expect(
			usageAlertsOf(
				trackOn({
					customerEntitlements: [perEntityRow()],
					withEntity: entityOf({
						alerts: [alert({ threshold_type: "usage", threshold: 1 })],
					}),
					value: 5,
				}),
			),
		).toEqual([]);
	});
});

describe("org alerts", () => {
	test("in sandbox the sandbox list applies and the live list is ignored", () => {
		const sandbox = usageAlertsOf(
			trackOn({ orgAlerts: { sandbox: [alert()] }, value: 8 }),
		);
		const live = usageAlertsOf(
			trackOn({ orgAlerts: { live: [alert()] }, value: 8 }),
		);

		expect(sandbox).toHaveLength(1);
		expect(live).toEqual([]);
	});

	test("an org alert with no feature applies to every feature", () => {
		expect(
			usageAlertsOf(
				trackOn({
					orgAlerts: { sandbox: [alert({ feature_id: undefined })] },
					value: 8,
				}),
			),
		).toHaveLength(1);
	});

	test("org and customer alerts at the same threshold both fire", () => {
		expect(
			usageAlertsOf(
				trackOn({
					customer: customerOf({ alerts: [alert()] }),
					orgAlerts: { sandbox: [alert()] },
					value: 8,
				}),
			),
		).toHaveLength(2);
	});
});

describe("basis", () => {
	test("usage_limit measures the cap's window, and reports it", () => {
		const [data] = dataOf(
			trackOn({
				customer: customerOf({
					alerts: [
						alert({
							basis: "usage_limit",
							threshold_type: "usage_percentage",
							threshold: 50,
						}),
					],
					usageLimits: [
						{
							feature_id: "messages",
							enabled: true,
							limit: 4,
							interval: ResetInterval.Day,
						},
					],
				}),
				value: 2,
			}),
		);

		expect(data).toMatchObject({
			usage_alert: { basis: "usage_limit" },
			usage_limit: { limit: 4, interval: "day", usage: 2, remaining: 2 },
		});
	});

	test("an unlimited balance never fires a balance-basis alert", () => {
		expect(
			usageAlertsOf(
				trackOn({
					customer: customerOf({
						alerts: [alert({ threshold_type: "usage", threshold: 1 })],
					}),
					customerEntitlements: [
						{ ...createCustomerEntitlement({ balance: 0 }), unlimited: true },
					],
					value: 5,
				}),
			),
		).toEqual([]);
	});
});

describe("idempotency", () => {
	test("the key names the org, env, customer, scope, feature, basis, threshold and minute", () => {
		const [webhook] = usageAlertsOf(
			trackOn({ customer: customerOf({ alerts: [alert()] }), value: 8 }),
		);

		expect(webhook?.idempotencyKey).toBe(
			`${identity.orgId}:sandbox:${identity.customerId}:_:customer:messages:balance:_:usage_percentage:80:_:${Math.floor(1_700_000_000_000 / 60_000)}`,
		);
	});
});

describe("a lock and its finalize", () => {
	/** A lock that takes `lockValue`, then a finalize that settles it at `finalValue`; both as the worker decides them. */
	const lockThenFinalize = ({
		lockValue,
		finalValue,
	}: {
		lockValue: number;
		finalValue: number;
	}): { onLock: DecidedOn; onFinalize: DecidedOn } => {
		const customer = customerOf({
			alerts: [alert({ threshold_type: "usage", threshold: 8 })],
		});
		const state = createSubjectState({
			identity,
			customer,
			customerProducts: [createCustomerProduct()],
			customerEntitlements: [createCustomerEntitlement({ balance: 10 })],
		});
		const catalog = catalogOf({ state, perEntity: false });
		const lockMutation = computeTrack({
			fullSubject: subjectStateToFullSubject({
				state,
				catalog,
				entityId: null,
			}),
			command: {
				...createTrackCommand({ value: lockValue, commandId: "cmd_lock" }),
				lock: {
					id: "lck_1",
					lockId: "L1",
					expiresAt: occurredAt + 86_400_000,
					expiryAction: "confirm",
				},
			},
		});
		const lockChange = lockMutation.changes.find(
			(change) => change.table === "locks" && change.op === "insert",
		);
		if (lockChange?.table !== "locks" || lockChange.op !== "insert")
			throw new Error("Expected the check to open a lock");
		const locked = applyMutation({ state, mutation: lockMutation });
		const finalizeMutation = computeFinalize({
			fullSubject: subjectStateToFullSubject({
				state: locked,
				catalog,
				entityId: null,
			}),
			command: {
				schemaVersion: 1,
				type: "finalize",
				commandId: "cmd_finalize",
				requestId: "req_finalize",
				identity,
				occurredAt,
				org: createTrackCommand().org,
				lock: lockChange.row,
				internalFeatureId: "feat_messages",
				finalValue,
				properties: null,
			},
		});
		const settled = applyMutation({
			state: locked,
			mutation: finalizeMutation,
		});
		const subjectOf = (subjectState: SubjectState) =>
			subjectStateToFullSubject({
				state: subjectState,
				catalog,
				entityId: null,
			});
		return {
			onLock: {
				mutation: lockMutation,
				before: subjectOf(state),
				after: subjectOf(locked),
			},
			onFinalize: {
				mutation: finalizeMutation,
				before: subjectOf(locked),
				after: subjectOf(settled),
			},
		};
	};

	test("a finalize that settles above the lock crosses the threshold the lock did not", () => {
		const { onLock, onFinalize } = lockThenFinalize({
			lockValue: 5,
			finalValue: 9,
		});

		expect(usageAlertsOf(onLock)).toEqual([]);
		const [data] = dataOf(onFinalize);
		expect(data).toMatchObject({
			customer_id: identity.customerId,
			feature_id: "messages",
			usage_alert: { threshold: 8, threshold_type: "usage" },
			balance: { usage: 9, remaining: 1 },
		});
	});

	test("a lock that already crossed the threshold fires once; settling it at the same value fires nothing more", () => {
		const { onLock, onFinalize } = lockThenFinalize({
			lockValue: 9,
			finalValue: 9,
		});

		expect(dataOf(onLock)).toHaveLength(1);
		expect(usageAlertsOf(onFinalize)).toEqual([]);
	});

	test("a finalize that gives usage back never fires", () => {
		const { onFinalize } = lockThenFinalize({ lockValue: 9, finalValue: 4 });

		expect(usageAlertsOf(onFinalize)).toEqual([]);
	});
});
