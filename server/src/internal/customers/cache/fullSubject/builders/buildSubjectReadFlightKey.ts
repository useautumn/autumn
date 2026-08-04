import type { SubjectReadFrom } from "@/db/resolveSubjectReadDb.js";
import { buildFullSubjectKey } from "./buildFullSubjectKey.js";

/** In-memory singleflight key — Redis subject key + modes that change the result. */
export const buildSubjectReadFlightKey = ({
	orgId,
	env,
	customerId,
	entityId,
	skipCache,
	readFrom,
}: {
	orgId: string;
	env: string;
	customerId: string;
	entityId?: string;
	skipCache: boolean;
	readFrom: SubjectReadFrom;
}) =>
	`${buildFullSubjectKey({
		orgId,
		env,
		customerId,
		entityId,
	})}:skipCache=${skipCache ? 1 : 0}:readFrom=${readFrom}`;
