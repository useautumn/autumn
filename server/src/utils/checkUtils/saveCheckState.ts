import type { AppEnv, FullCustomer, Organization } from "@autumn/shared";
import { upstash } from "../../external/redis/initUpstash.js";
import type { RedisChecksState, StateCheckResult } from "./stateCheckTypes.js";

type CheckType = RedisChecksState["checks"][number]["type"];

/** Saves check state to Redis with merging logic for existing state. */
export const saveCheckState = async ({
	org,
	env,
	fullCus,
	result,
}: {
	org: Organization;
	env: AppEnv;
	fullCus: FullCustomer;
	result: StateCheckResult;
}): Promise<void> => {
	const newFailedChecks = result.checks
		.filter((c): c is typeof c & { type: CheckType } => c.type !== "overall_status")
		.filter((c) => !c.passed);

	// Skip Redis entirely if all checks pass
	if (newFailedChecks.length === 0) return;

	const stateKey = `state:${org.id}:${env}:${fullCus.internal_id}`;
	
	const existingState = (await upstash.get(stateKey)) as RedisChecksState | null;

	if (existingState) {
		// Merge with existing state
		const existingFailedTypes = new Set<CheckType>(existingState.checks.map((c) => c.type));
		const newFailedTypes = new Set<CheckType>(newFailedChecks.map((c) => c.type));



		// Checks that were fixed (existed before but not now)
		const checksToRemove = new Set<CheckType>(
			[...existingFailedTypes].filter((type) => !newFailedTypes.has(type)),
		);
		// Checks that are new failures
		const checksToAdd = new Set<CheckType>(
			[...newFailedTypes].filter((type) => !existingFailedTypes.has(type)),
		);

		// Keep checks that still fail, remove ones that are fixed
		const updatedChecks = existingState.checks.filter((c) => !checksToRemove.has(c.type));

		// Add new failing checks
		for (const check of newFailedChecks) {
			if (checksToAdd.has(check.type)) {
				updatedChecks.push({
					type: check.type,
					passed: check.passed,
					message: check.message ?? "",
					data: check.data,
				});
			}
		}

		// Keep existing status - all status changes should be done through the dashboard

		const updatedState: RedisChecksState = {
			...existingState,
			checks: updatedChecks,
		};
		await upstash.set(stateKey, JSON.stringify(updatedState));

	} else {
		// Create new state
		const newState: RedisChecksState = {
			status: "new",
			customer: {
				id: fullCus.id ?? "",
				email: fullCus.email || "",
				name: fullCus.name || "",
				env,
				processor: fullCus.processor,
			},
			org_id: org.id,
			env,
			checks: newFailedChecks.map((c) => ({
				type: c.type,
				passed: c.passed,
				message: c.message ?? "",
				data: c.data,
			})),
		};
		await upstash.set(stateKey, JSON.stringify(newState));

	}
};

