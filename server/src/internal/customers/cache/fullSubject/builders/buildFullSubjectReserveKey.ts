import { buildFullSubjectKey } from "./buildFullSubjectKey.js";

export const buildFullSubjectReserveKey = ({
	orgId,
	env,
	customerId,
	entityId,
}: {
	orgId: string;
	env: string;
	customerId: string;
	entityId?: string;
}) =>
	`${buildFullSubjectKey({
		orgId,
		env,
		customerId,
		entityId,
	})}:reserve`;
