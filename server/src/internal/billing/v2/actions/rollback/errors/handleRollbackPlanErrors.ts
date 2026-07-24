import { type AutumnBillingPlan, ErrCode, RecaseError } from "@autumn/shared";

const ROLLBACK_FIELDS = new Set<keyof AutumnBillingPlan>([
	"customerId",
	"insertCustomerProducts",
	"updateCustomerProduct",
	"updateCustomerProducts",
	"deleteCustomerProduct",
	"deleteCustomerProducts",
	"patchCustomerProducts",
	"updateCustomerEntitlements",
	"updateByStripeScheduleId",
	"lineItems",
	"customLineItems",
	"refundPlan",
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
};
