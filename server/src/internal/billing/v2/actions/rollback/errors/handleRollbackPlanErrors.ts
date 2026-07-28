import { type AutumnBillingPlan, ErrCode, RecaseError } from "@autumn/shared";
import { getCustomerProductPlanOperations } from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations";

const ROLLBACK_OPERATION_FIELDS = [
	"insertCustomerProducts",
	"updateCustomerProduct",
	"updateCustomerProducts",
	"deleteCustomerProduct",
	"deleteCustomerProducts",
	"patchCustomerProducts",
	"updateCustomerEntitlements",
	"pooledBalancePlan",
] satisfies (keyof AutumnBillingPlan)[];

// These destroy or create state the plan does not capture (cascaded
// contributions, zeroed source balances, expiry decisions) — not invertible.
const UNINVERTIBLE_POOLED_FIELDS = [
	"updatePoolContributions",
	"deletePoolContributions",
	"deletePoolBalances",
	"expirePoolBalanceCandidates",
	"insertPoolRollovers",
] as const;

const ROLLBACK_INERT_FIELDS = [
	"customerId",
	"updateByStripeScheduleId",
	"lineItems",
	"customLineItems",
	"refundPlan",
] satisfies (keyof AutumnBillingPlan)[];

const ROLLBACK_FIELDS = new Set<keyof AutumnBillingPlan>([
	...ROLLBACK_OPERATION_FIELDS,
	...ROLLBACK_INERT_FIELDS,
]);

const throwRollbackError = (message: string): never => {
	throw new RecaseError({
		message: `billing.rollback: ${message}`,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};

const isPopulated = (value: unknown) =>
	value !== undefined && (!Array.isArray(value) || value.length > 0);

const validateUniqueIds = ({
	ids,
	operation,
}: {
	ids: string[];
	operation: string;
}) => {
	const seen = new Set<string>();
	for (const id of ids) {
		if (seen.has(id)) {
			throwRollbackError(`duplicate ${operation}: ${id}`);
		}
		seen.add(id);
	}
};

export const handleRollbackPlanErrors = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	const unsupportedFields = Object.entries(autumnBillingPlan)
		.filter(
			([key, value]) =>
				!ROLLBACK_FIELDS.has(key as keyof AutumnBillingPlan) &&
				isPopulated(value),
		)
		.map(([key]) => key);
	if (unsupportedFields.length > 0) {
		throwRollbackError(
			`unsupported operations: ${unsupportedFields.join(", ")}`,
		);
	}

	const { pooledBalancePlan } = autumnBillingPlan;
	if (pooledBalancePlan) {
		const uninvertibleFields = UNINVERTIBLE_POOLED_FIELDS.filter(
			(field) => (pooledBalancePlan[field]?.length ?? 0) > 0,
		);
		if (uninvertibleFields.length > 0) {
			throwRollbackError(
				`unsupported pooled operations: ${uninvertibleFields.join(", ")}`,
			);
		}
	}

	const { deletes, patches } = getCustomerProductPlanOperations({
		autumnBillingPlan,
	});
	validateUniqueIds({
		ids: deletes.map(({ id }) => id),
		operation: "customer product delete",
	});
	validateUniqueIds({
		ids: patches.flatMap(({ deleteCustomerEntitlements }) =>
			deleteCustomerEntitlements.map(({ id }) => id),
		),
		operation: "customer entitlement delete",
	});
	validateUniqueIds({
		ids: patches.flatMap(({ deleteCustomerPrices }) =>
			deleteCustomerPrices.map(({ id }) => id),
		),
		operation: "customer price delete",
	});
	validateUniqueIds({
		ids: (autumnBillingPlan.updateCustomerEntitlements ?? []).flatMap(
			({ deletedReplaceables }) =>
				(deletedReplaceables ?? []).map(({ id }) => id),
		),
		operation: "replaceable delete",
	});
};
