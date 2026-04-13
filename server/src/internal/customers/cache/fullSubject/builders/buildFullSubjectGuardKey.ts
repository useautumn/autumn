import { buildFullSubjectKey } from "./buildFullSubjectKey.js";

export const buildFullSubjectGuardKey = ({
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
	})}:guard`;
