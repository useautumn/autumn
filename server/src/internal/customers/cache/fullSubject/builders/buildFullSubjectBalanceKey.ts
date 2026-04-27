import { buildFullSubjectKey } from "./buildFullSubjectKey.js";

export const buildFullSubjectBalanceKey = ({
	orgId,
	env,
	customerId,
	featureId,
	entityId,
}: {
	orgId: string;
	env: string;
	customerId: string;
	featureId: string;
	entityId?: string;
}) =>
	`${buildFullSubjectKey({
		orgId,
		env,
		customerId,
		entityId,
	})}:balances:${featureId}`;
