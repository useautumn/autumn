import {
	type DeductionDecision,
	deductionRowToCurrentBalance,
	type TrackCommand,
	type WorkerFullSubject,
} from "@autumn/balance-engine";
import { AppEnv, isThresholdBillingCustomerProduct } from "@autumn/shared";

const hasAny = (values: readonly unknown[] | null | undefined): boolean =>
	(values?.length ?? 0) > 0;

/** Alerts, top-ups and threshold billing fire on thresholds of their own, so any of them keeps every effect decided. */
export const subjectAlwaysDecidesEffects = ({
	fullSubject,
}: {
	fullSubject: WorkerFullSubject;
}): boolean =>
	hasAny(fullSubject.customer.usage_alerts) ||
	hasAny(fullSubject.customer.auto_topups) ||
	hasAny(fullSubject.entity?.usage_alerts) ||
	fullSubject.customer_products.some(
		(customerProduct) =>
			hasAny(customerProduct.product?.usage_alerts) ||
			hasAny(customerProduct.product?.auto_topups) ||
			isThresholdBillingCustomerProduct({ customerProduct }),
	);

const orgConfiguresAlerts = ({ command }: { command: TrackCommand }): boolean =>
	hasAny(
		command.identity.env === AppEnv.Sandbox
			? command.org.config.sandbox_usage_alerts
			: command.org.config.usage_alerts,
	);

/** A drawn row ran out: at or below zero from above it, or down to its overage floor. */
const drewRowDry = ({ decision }: { decision: DeductionDecision }): boolean => {
	const { context, deltas } = decision.outcome;
	return [...context.rows, ...context.rolloverRows].some((row) => {
		const after = deductionRowToCurrentBalance({ row, deltas });
		const crossedZero = row.balance > 0 && after.lte(0);
		const reachedFloor = row.minBalance !== null && after.lte(row.minBalance);
		return (crossedZero || reachedFloor) && !after.eq(row.balance);
	});
};

/** A windowed cap, an allocation gate or a spend limit can close the feature on a draw that was applied in full. */
const isBoundedByControls = ({
	decision,
}: {
	decision: DeductionDecision;
}): boolean => {
	const { context } = decision.outcome;
	return (
		context.usageWindowLimits.length > 0 ||
		context.allocationGates.size > 0 ||
		context.rows.some(
			(row) => context.spendLimitByFeatureId[row.featureId] !== undefined,
		)
	);
};

/**
 * Whether a track's effects need deciding: without alerts, top-ups or threshold billing the only effect is a
 * limit reached, and a draw can only reach a limit by running a row dry, being refused, or under a control.
 */
export const shouldDecideEffects = ({
	command,
	decision,
	alwaysDecides,
}: {
	command: TrackCommand;
	decision: DeductionDecision;
	alwaysDecides: boolean;
}): boolean => {
	const { outcome } = decision;
	return (
		alwaysDecides ||
		orgConfiguresAlerts({ command }) ||
		command.value < 0 ||
		outcome.rejected ||
		outcome.limitType !== null ||
		isBoundedByControls({ decision }) ||
		drewRowDry({ decision })
	);
};
