/**
 * Contract: same-definition survivors (`retained`) only emit a replace when
 * usage is NOT carried. Carry-enabled / allocated / carry_from_previous leave
 * those rows untouched. Default reset writes `set toGranted` on the existing id.
 */

import { describe, expect, test } from "bun:test";
import {
	AllowanceType,
	type CarryOverUsages,
	EntInterval,
	type EntitlementPrice,
	type EntitlementWithFeature,
	FeatureType,
	FeatureUsageType,
	type InitCustomerEntitlementContext,
} from "@autumn/shared";
import { computeEntitlementPriceOperations } from "@/internal/billing/v2/actions/batchTransition/compute/operations/entitlementPriceOperations/computeEntitlementPriceOperations";

const NOW = 1_700_000_000_000;

const feature = ({
	id,
	type = FeatureType.Metered,
	usageType = FeatureUsageType.Single,
}: {
	id: string;
	type?: FeatureType;
	usageType?: FeatureUsageType;
}) => ({
	internal_id: `internal_${id}`,
	org_id: "org_test",
	created_at: NOW,
	env: "sandbox",
	id,
	name: id,
	type,
	config: type === FeatureType.Boolean ? null : { usage_type: usageType },
	display: null,
	archived: false,
	event_names: [],
	model_markups: null,
	stripe_meter: null,
});

const entitlement = ({
	id,
	feature: entFeature,
	allowance = 200,
	carryFromPrevious = false,
}: {
	id: string;
	feature: ReturnType<typeof feature>;
	allowance?: number;
	carryFromPrevious?: boolean;
}): EntitlementWithFeature =>
	({
		id,
		created_at: NOW,
		internal_feature_id: entFeature.internal_id,
		internal_product_id: "product_test",
		internal_reward_id: null,
		is_custom: false,
		allowance_type:
			entFeature.type === FeatureType.Boolean
				? AllowanceType.None
				: AllowanceType.Fixed,
		allowance,
		interval:
			entFeature.type === FeatureType.Boolean ? null : EntInterval.Month,
		interval_count: 1,
		carry_from_previous: carryFromPrevious,
		entity_feature_id: null,
		usage_limit: null,
		feature: entFeature,
	}) as EntitlementWithFeature;

const messages = feature({ id: "messages" });
const words = feature({ id: "words" });
const workflows = feature({
	id: "workflows",
	usageType: FeatureUsageType.Continuous,
});
const admin = feature({ id: "admin", type: FeatureType.Boolean });

const entitlementPrice = (
	ent: EntitlementWithFeature,
): EntitlementPrice => ({ entitlement: ent });

const initContext = {
	fullCustomer: { id: "cus", internal_id: "cus_internal", entities: [] },
	fullProduct: { id: "seat", internal_id: "seat_internal" },
	featureQuantities: [],
	resetCycleAnchor: NOW,
	freeTrial: null,
	now: NOW,
} as unknown as InitCustomerEntitlementContext;

const computeRetained = ({
	ent,
	carryOverUsages,
}: {
	ent: EntitlementWithFeature;
	carryOverUsages?: CarryOverUsages;
}) =>
	computeEntitlementPriceOperations({
		candidateOutgoingEntitlements: [ent],
		entitlementPriceTransitions: {
			transitions: [],
			retained: [
				{
					fromEntitlementPrice: entitlementPrice(ent),
					toEntitlementPrice: entitlementPrice(ent),
				},
			],
			added: [],
			deleted: [],
		},
		customerEntitlementInitContext: initContext,
		customerEntitlementInitOptions: { customerLicenseLinkId: "link_1" },
		carryOverUsages,
	});

describe("retained entitlement operations", () => {
	test("default (no carry) emits a same-id replace that sets the grant", () => {
		const messagesEnt = entitlement({ id: "ent_messages", feature: messages });
		const { operations, unhandled } = computeRetained({ ent: messagesEnt });
		expect(unhandled.retained).toEqual([]);
		expect(operations).toEqual([
			{
				type: "replace",
				fromEntitlementIds: ["ent_messages"],
				toEntitlementId: "ent_messages",
				fromEntitlementPrice: entitlementPrice(messagesEnt),
				toEntitlementPrice: entitlementPrice(messagesEnt),
				customerEntitlementPatch: {
					balance: { type: "set", amount: 200 },
				},
			},
		]);
	});

	test("carryOverUsages enabled emits no retained replace", () => {
		const messagesEnt = entitlement({ id: "ent_messages", feature: messages });
		const { operations } = computeRetained({
			ent: messagesEnt,
			carryOverUsages: { enabled: true },
		});
		expect(operations).toEqual([]);
	});

	test("carryOverUsages disabled still resets a retained entitlement", () => {
		const messagesEnt = entitlement({ id: "ent_messages", feature: messages });
		const { operations } = computeRetained({
			ent: messagesEnt,
			carryOverUsages: { enabled: false },
		});
		expect(operations).toHaveLength(1);
		expect(operations[0]).toMatchObject({
			type: "replace",
			fromEntitlementIds: ["ent_messages"],
			customerEntitlementPatch: {
				balance: { type: "set", amount: 200 },
			},
		});
	});

	test("allocated retained entitlements never emit a replace", () => {
		const workflowsEnt = entitlement({
			id: "ent_workflows",
			feature: workflows,
		});
		const { operations } = computeRetained({ ent: workflowsEnt });
		expect(operations).toEqual([]);
	});

	test("carry_from_previous retained entitlements never emit a replace", () => {
		const messagesEnt = entitlement({
			id: "ent_messages",
			feature: messages,
			carryFromPrevious: true,
		});
		const { operations } = computeRetained({ ent: messagesEnt });
		expect(operations).toEqual([]);
	});

	test("feature_ids excluding the retained feature still resets it", () => {
		const messagesEnt = entitlement({ id: "ent_messages", feature: messages });
		const { operations } = computeRetained({
			ent: messagesEnt,
			carryOverUsages: { enabled: true, feature_ids: ["words"] },
		});
		expect(operations).toHaveLength(1);
		expect(operations[0]).toMatchObject({
			type: "replace",
			fromEntitlementIds: ["ent_messages"],
			customerEntitlementPatch: {
				balance: { type: "set", amount: 200 },
			},
		});
	});

	test("feature_ids including the retained feature emits no replace", () => {
		const messagesEnt = entitlement({ id: "ent_messages", feature: messages });
		const { operations } = computeRetained({
			ent: messagesEnt,
			carryOverUsages: { enabled: true, feature_ids: ["messages"] },
		});
		expect(operations).toEqual([]);
	});

	test("boolean retained entitlements never emit a replace", () => {
		const adminEnt = entitlement({ id: "ent_admin", feature: admin });
		const { operations } = computeRetained({ ent: adminEnt });
		expect(operations).toEqual([]);
	});

	test("mixed retained features only replace the ones that are not carried", () => {
		const messagesEnt = entitlement({ id: "ent_messages", feature: messages });
		const wordsEnt = entitlement({ id: "ent_words", feature: words });
		const workflowsEnt = entitlement({
			id: "ent_workflows",
			feature: workflows,
		});
		const { operations } = computeEntitlementPriceOperations({
			candidateOutgoingEntitlements: [messagesEnt, wordsEnt, workflowsEnt],
			entitlementPriceTransitions: {
				transitions: [],
				retained: [messagesEnt, wordsEnt, workflowsEnt].map((ent) => ({
					fromEntitlementPrice: entitlementPrice(ent),
					toEntitlementPrice: entitlementPrice(ent),
				})),
				added: [],
				deleted: [],
			},
			customerEntitlementInitContext: initContext,
			customerEntitlementInitOptions: { customerLicenseLinkId: "link_1" },
			carryOverUsages: { enabled: true, feature_ids: ["words"] },
		});
		expect(operations).toHaveLength(1);
		expect(operations[0]).toMatchObject({
			type: "replace",
			fromEntitlementIds: ["ent_messages"],
			toEntitlementId: "ent_messages",
			customerEntitlementPatch: {
				balance: { type: "set", amount: 200 },
			},
		});
	});
});
