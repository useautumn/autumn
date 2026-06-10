import { RecaseError } from "@autumn/shared";
import { metrics } from "@opentelemetry/api";
import { getRuntimeFullSubjectGateConfig } from "@/internal/misc/fullSubjectGateEdgeConfig/fullSubjectGateEdgeConfigStore.js";
import { getRegisteredPoolMax } from "./pgPoolMonitor.js";

const CRITICAL_POOL_NAME = "critical";
const noop = (): void => {};

let inFlight = 0;

const meter = metrics.getMeter("autumn-server");
const shedCounter = meter.createCounter("autumn.critical_db.admission.shed", {
	description:
		"Critical-route requests shed with 503 before acquiring a DB connection",
});
const activeCounter = meter.createUpDownCounter(
	"autumn.critical_db.admission.active",
	{
		description: "Critical-route requests currently holding an admission slot",
	},
);

export const enterCriticalDb = (): (() => void) => {
	const {
		critical_db_admission_enabled,
		critical_db_share,
		critical_db_reserve,
	} = getRuntimeFullSubjectGateConfig();
	if (!critical_db_admission_enabled) return noop;

	const poolMax = getRegisteredPoolMax(CRITICAL_POOL_NAME);
	if (!poolMax || poolMax <= 0) return noop;

	const limit = Math.max(
		1,
		Math.floor(poolMax * critical_db_share) - critical_db_reserve,
	);
	if (inFlight >= limit) {
		shedCounter.add(1);
		throw new RecaseError({
			message: "Service is temporarily unavailable, please retry shortly.",
			code: "service_unavailable",
			statusCode: 503,
			data: { reason: "critical_db_saturated" },
		});
	}

	inFlight += 1;
	activeCounter.add(1);
	let released = false;
	return () => {
		if (released) return;
		released = true;
		inFlight -= 1;
		activeCounter.add(-1);
	};
};
