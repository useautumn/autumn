import {
	createSubjectState,
	type SubjectState,
	type WorkerUsageWindow,
} from "@autumn/balance-engine";
import { EntInterval, getUsageWindowBounds } from "@autumn/shared";
import {
	createCatalogFor,
	createCustomerEntitlement,
	createCustomerProduct,
	identity,
	occurredAt,
} from "../../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import { atomOrg } from "../../unit/utils/atomFixtures.js";

/** Never denied in a run: the rig measures cost, not refusals. */
const BALANCE = 1_000_000_000;
const PRODUCTS = 3;
/** Nine features; messages and the first four carry a second balance, so 14 in all, as resend's median customer. */
const FEATURES = 9;
const SECOND_BALANCES = 5;

const productIdOf = (index: number) => `cp_${index + 1}`;

const entitlementOf = ({
	id,
	featureId,
	product,
}: {
	id: string;
	featureId: string;
	product: number;
}) => ({
	...createCustomerEntitlement({ id, featureId, balance: BALANCE }),
	customer_product_id: productIdOf(product),
});

/** Resend's shape: 14 balances over 9 features on 3 products, and one usage window that has expired. */
export const resendSubjectOf = ({ customerId }: { customerId: string }) => {
	const featureIds = Array.from({ length: FEATURES }, (_, i) =>
		i === 0 ? "messages" : `feature_${i}`,
	);
	const firsts = featureIds.map((featureId, i) =>
		entitlementOf({
			id: `${featureId}_monthly`,
			featureId,
			product: i % PRODUCTS,
		}),
	);
	const seconds = featureIds.slice(0, SECOND_BALANCES).map((featureId, i) =>
		entitlementOf({
			id: `${featureId}_lifetime`,
			featureId,
			product: (i + 1) % PRODUCTS,
		}),
	);
	const yesterday = getUsageWindowBounds({
		interval: EntInterval.Day,
		now: occurredAt - 86_400_000,
	});
	const expiredWindow: WorkerUsageWindow = {
		id: "uw_messages",
		internal_customer_id: "cus_internal_1",
		internal_entity_id: null,
		feature_id: "messages",
		internal_feature_id: "feat_messages",
		filter_key: null,
		anchor_customer_entitlement_id: null,
		window_start_at: yesterday.windowStartAt,
		window_end_at: yesterday.windowEndAt,
		usage: 3,
		updated_at: yesterday.windowStartAt,
	};
	const state: SubjectState = createSubjectState({
		identity: { ...identity, customerId },
		customerProducts: Array.from({ length: PRODUCTS }, (_, i) => ({
			...createCustomerProduct({ id: productIdOf(i) }),
			internal_product_id: `prod_internal_${i + 1}`,
		})),
		customerEntitlements: [...firsts, ...seconds],
		usageWindows: [expiredWindow],
	});
	return { state, catalog: createCatalogFor({ state }), org: atomOrg };
};
