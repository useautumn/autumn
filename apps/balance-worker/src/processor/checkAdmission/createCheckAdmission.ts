import { CheckCapacityError } from "../common/processorErrors.js";
import type {
	CheckAdmission,
	CheckAdmissionCounters,
} from "./types/checkAdmission.js";

/** Bounds one customer's checks in flight, as the writer bounds its pending writes, so a burst sheds only that customer. */
export const createCheckAdmission = ({
	config,
}: {
	config: { maxInFlightPerCustomer: number };
}): CheckAdmission => {
	const inFlightByCustomerKey = new Map<string, number>();
	const counters: CheckAdmissionCounters = { checksShed: 0 };

	async function admit<Result>({
		customerKey,
		run,
	}: {
		customerKey: string;
		run: () => Promise<Result>;
	}): Promise<Result> {
		const inFlight = inFlightByCustomerKey.get(customerKey) ?? 0;
		if (inFlight >= config.maxInFlightPerCustomer) {
			counters.checksShed++;
			throw new CheckCapacityError({ customerKey });
		}
		inFlightByCustomerKey.set(customerKey, inFlight + 1);
		try {
			return await run();
		} finally {
			release({ customerKey });
		}
	}

	function release({ customerKey }: { customerKey: string }): void {
		const remaining = (inFlightByCustomerKey.get(customerKey) ?? 1) - 1;
		if (remaining === 0) inFlightByCustomerKey.delete(customerKey);
		else inFlightByCustomerKey.set(customerKey, remaining);
	}

	function readCounters(): CheckAdmissionCounters {
		return { ...counters };
	}

	return { admit, readCounters };
};
