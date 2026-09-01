import { Decimal } from "decimal.js";
import type {
	CustomerMeteringState,
	DirectMeteredV1FeatureState,
	MeteringIdentity,
	TrackCommand,
} from "../contracts.js";
import { parseCustomerMeteringState } from "./parsers.js";

export const createCustomerMeteringState = ({
	identity,
	featureStatesById,
}: {
	identity: MeteringIdentity;
	featureStatesById: Record<string, DirectMeteredV1FeatureState>;
}): CustomerMeteringState =>
	parseCustomerMeteringState({
		input: {
			schemaVersion: 1,
			identity,
			revision: 0,
			featureStatesById,
		},
	});

export const meteringPartitionKeyOf = ({
	identity,
}: {
	identity: MeteringIdentity;
}): string =>
	JSON.stringify([identity.orgId, identity.env, identity.customerId]);

export const shadowComparisonKeyOf = ({
	command,
}: {
	command: TrackCommand;
}): string =>
	JSON.stringify([
		command.identity.orgId,
		command.identity.env,
		command.identity.customerId,
		command.featureId,
		command.commandId,
	]);

export const identitiesMatch = ({
	left,
	right,
}: {
	left: MeteringIdentity;
	right: MeteringIdentity;
}): boolean =>
	left.orgId === right.orgId &&
	left.env === right.env &&
	left.customerId === right.customerId;

export const balanceOf = ({
	featureState,
}: {
	featureState: DirectMeteredV1FeatureState;
}): number =>
	featureState.customerEntitlements
		.reduce(
			(total, customerEntitlement) => total.plus(customerEntitlement.balance),
			new Decimal(0),
		)
		.toNumber();

export const availableBalanceOf = ({
	featureState,
}: {
	featureState: DirectMeteredV1FeatureState;
}): Decimal =>
	featureState.customerEntitlements.reduce(
		(total, customerEntitlement) =>
			total.plus(Decimal.max(customerEntitlement.balance, 0)),
		new Decimal(0),
	);
