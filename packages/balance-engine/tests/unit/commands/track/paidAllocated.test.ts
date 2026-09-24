import { describe, expect, test } from "bun:test";
import {
	BillingInterval,
	BillWhen,
	FeatureUsageType,
	PriceType,
} from "@autumn/shared";
import {
	computeCheck,
	computeTrack,
	createSubjectState,
	subjectStateToFullSubject,
	UnsupportedCommandError,
} from "../../../../src/balanceEngine.js";
import {
	createCatalogFor,
	createCheckCommand,
	createCustomerEntitlement,
	createCustomerProduct,
	createTrackCommand,
	identity,
	occurredAt,
	testProductInternalId,
} from "../../engineFixtures.js";

/** A continuous ("allocated") grant, priced or free; a priced one bills in arrears, prorated (v1) or not (v2). */
const allocatedSubject = ({
	priced,
	prorated = true,
	continuous = true,
}: {
	priced: boolean;
	prorated?: boolean;
	continuous?: boolean;
}) => {
	const state = createSubjectState({
		identity,
		customerProducts: [createCustomerProduct()],
		customerPrices: priced
			? [
					{
						id: "cpr_seats",
						internal_customer_id: "cus_internal_1",
						customer_product_id: "cp_1",
						price_id: "price_seats",
						created_at: occurredAt,
					},
				]
			: [],
		customerEntitlements: [createCustomerEntitlement({ balance: 10 })],
	});
	const catalog = createCatalogFor({ state });
	const feature = catalog.features.feat_messages;
	if (!feature) throw new Error("fixture feature missing");
	feature.config = continuous
		? { usage_type: FeatureUsageType.Continuous }
		: { usage_type: FeatureUsageType.Single };
	if (priced) {
		catalog.prices.price_seats = {
			id: "price_seats",
			internal_product_id: testProductInternalId,
			entitlement_id: "ent_messages_monthly",
			proration_config: null,
			config: {
				type: PriceType.Usage,
				bill_when: BillWhen.EndOfPeriod,
				should_prorate: prorated,
				billing_units: 1,
				internal_feature_id: "feat_messages",
				feature_id: "messages",
				usage_tiers: [{ to: "inf", amount: 50 }],
				interval: BillingInterval.Month,
			},
		};
	}
	return subjectStateToFullSubject({ state, catalog });
};

const track = (fullSubject: ReturnType<typeof allocatedSubject>) =>
	computeTrack({
		fullSubject,
		command: createTrackCommand({ value: 3, overageBehavior: "cap" }),
	});

describe("track: paid allocated v1", () => {
	test("a paid, prorated allocated grant is refused: Postgres invoices it", () => {
		expect(() => track(allocatedSubject({ priced: true }))).toThrow(
			new UnsupportedCommandError({ reason: "paid_allocated_not_supported" }),
		);
	});

	test("a free allocated grant, a v2 allocated grant and a metered grant deduct on the worker", () => {
		for (const fullSubject of [
			allocatedSubject({ priced: false }),
			allocatedSubject({ priced: true, prorated: false }),
			allocatedSubject({ priced: true, continuous: false }),
		]) {
			expect(track(fullSubject).changes).toHaveLength(1);
		}
	});

	test("check on a paid allocated grant still answers: only track defers", () => {
		expect(
			computeCheck({
				fullSubject: allocatedSubject({ priced: true }),
				command: createCheckCommand(),
			}).allowed,
		).toBe(true);
	});
});
