import type { AxRunOutput } from "../../types/axRunOutput.ts";
import type { Expectation } from "../types/expectation.ts";

/** Behavioral graders for integration cases: the probe (the app's own
 * endpoints) and the oracle (the run org's state) are the ground truth. */
export const integration = {
	/** the agent-edited fixture still boots and serves /health */
	appBoots: (): Expectation => ({
		name: "app boots",
		kind: "config",
		score: (output: AxRunOutput) => ({
			name: "app boots",
			score: output.probe?.booted ? 1 : 0,
			metadata: output.probe?.booted
				? undefined
				: {
						why: "the app failed to start",
						bootError: output.probe?.bootError,
					},
		}),
	}),

	/** the Nth probe call (1-based) came back with the given status */
	probeStatus: (
		label: string,
		{ call, status }: { call: number; status: number },
	): Expectation => ({
		name: label,
		kind: "config",
		score: (output: AxRunOutput) => {
			const probeCall = output.probe?.calls[call - 1];
			const passed = probeCall?.status === status;
			return {
				name: label,
				score: passed ? 1 : 0,
				metadata: passed
					? undefined
					: {
							why: probeCall
								? `call ${call} returned ${probeCall.status}, expected ${status}`
								: `probe made only ${output.probe?.calls.length ?? 0} calls`,
							body: probeCall?.body,
						},
			};
		},
	}),

	/** the Nth probe call (1-based) was refused — any 4xx, not a 5xx crash */
	probeBlocked: (label: string, { call }: { call: number }): Expectation => ({
		name: label,
		kind: "config",
		score: (output: AxRunOutput) => {
			const probeCall = output.probe?.calls[call - 1];
			const passed =
				probeCall !== undefined &&
				probeCall.status >= 400 &&
				probeCall.status < 500;
			return {
				name: label,
				score: passed ? 1 : 0,
				metadata: passed
					? undefined
					: {
							why: probeCall
								? `call ${call} returned ${probeCall.status}, expected a 4xx refusal`
								: `probe made only ${output.probe?.calls.length ?? 0} calls`,
							body: probeCall?.body,
						},
			};
		},
	}),

	/** the oracle customer exists with the fixture's id (and email when set) */
	customerCreated: ({ email }: { email?: string } = {}): Expectation => ({
		name: "customer created in the org",
		kind: "config",
		score: (output: AxRunOutput) => {
			const oracle = output.oracle;
			const found = oracle?.found === true;
			const emailOk = email === undefined || oracle?.email === email;
			return {
				name: "customer created in the org",
				score: found && emailOk ? 1 : 0,
				metadata:
					found && emailOk
						? undefined
						: {
								why: !found
									? "no customer with the fixture's user id exists in the org"
									: `customer email is ${String(oracle?.email)}, expected ${email}`,
							},
			};
		},
	}),

	/** the customer holds the plan in the org (oracle) */
	planAttached: ({ planId }: { planId: string }): Expectation => {
		const name = `on the ${planId} plan`;
		return {
			name,
			kind: "config",
			score: (output: AxRunOutput) => {
				const passed = output.oracle?.planIds.includes(planId) === true;
				return {
					name,
					score: passed ? 1 : 0,
					metadata: passed
						? undefined
						: {
								why: `customer's plans are [${output.oracle?.planIds.join(", ") ?? ""}]`,
							},
				};
			},
		};
	},

	/** the Nth probe call's JSON body contains a value matching the pattern
	 * (searched recursively through strings) */
	probeBodyHas: (
		label: string,
		{ call, pattern }: { call: number; pattern: RegExp },
	): Expectation => ({
		name: label,
		kind: "config",
		score: (output: AxRunOutput) => {
			const probeCall = output.probe?.calls[call - 1];
			const passed =
				probeCall !== undefined && pattern.test(JSON.stringify(probeCall.body));
			return {
				name: label,
				score: passed ? 1 : 0,
				metadata: passed
					? undefined
					: {
							why: probeCall
								? `call ${call}'s body has no match for ${pattern}`
								: `probe made only ${output.probe?.calls.length ?? 0} calls`,
							body: probeCall?.body,
						},
			};
		},
	}),

	/** the agent's code must NOT contain the pattern (checked on added lines
	 * of the fixture diff) — e.g. no billing.attach for a default plan */
	diffAvoids: (
		label: string,
		{ pattern }: { pattern: RegExp },
	): Expectation => ({
		name: label,
		kind: "config",
		score: (output: AxRunOutput) => {
			const addedLines = (output.fixtureDiff ?? "")
				.split("\n")
				.filter((line) => line.startsWith("+") && !line.startsWith("+++"));
			const offending = addedLines.filter((line) => pattern.test(line));
			return {
				name: label,
				score: offending.length === 0 ? 1 : 0,
				metadata:
					offending.length === 0
						? undefined
						: { why: `agent's code matches ${pattern}`, lines: offending },
			};
		},
	}),

	/** the agent's code MUST contain the pattern somewhere on the added lines
	 * of the fixture diff — e.g. a lock/finalize flow rather than plain track */
	diffRequires: (
		label: string,
		{ pattern }: { pattern: RegExp },
	): Expectation => ({
		name: label,
		kind: "config",
		score: (output: AxRunOutput) => {
			const addedLines = (output.fixtureDiff ?? "")
				.split("\n")
				.filter((line) => line.startsWith("+") && !line.startsWith("+++"));
			const passed = addedLines.some((line) => pattern.test(line));
			return {
				name: label,
				score: passed ? 1 : 0,
				metadata: passed
					? undefined
					: { why: `no added line in the agent's code matches ${pattern}` },
			};
		},
	}),

	/** exactly these entity ids hold an active license for the plan */
	licensesAssigned: ({
		planId,
		entityIds,
	}: {
		planId: string;
		entityIds: string[];
	}): Expectation => {
		const name = `${entityIds.length} active ${planId} licenses`;
		return {
			name,
			kind: "config",
			score: (output: AxRunOutput) => {
				const active = (output.licenseAssignments ?? []).filter(
					(assignment) => assignment.license_plan_id === planId,
				);
				const assignedIds = active
					.map((assignment) => assignment.entity_id)
					.sort();
				const passed =
					JSON.stringify(assignedIds) === JSON.stringify([...entityIds].sort());
				return {
					name,
					score: passed ? 1 : 0,
					metadata: passed
						? undefined
						: {
								why: `active ${planId} assignments: [${assignedIds.join(", ")}], expected [${entityIds.join(", ")}]`,
							},
				};
			},
		};
	},

	/** the customer's effective spend_limits carry an entry for the feature
	 * whose provided fields all match (fields left undefined are not checked) */
	spendLimitSet: ({
		featureId,
		enabled,
		skipOverageBilling,
		limitType,
		overageLimit,
	}: {
		featureId: string;
		enabled?: boolean;
		skipOverageBilling?: boolean;
		limitType?: "absolute" | "usage_percentage";
		overageLimit?: number;
	}): Expectation => {
		const name = `spend limit set on ${featureId}`;
		return {
			name,
			kind: "config",
			score: (output: AxRunOutput) => {
				const spendLimits = output.oracle?.billing_controls?.spend_limits ?? [];
				const entry = spendLimits.find(
					(candidate) => candidate.feature_id === featureId,
				);
				const mismatches: string[] = [];
				if (!entry) mismatches.push(`no spend_limits entry for ${featureId}`);
				else {
					if (enabled !== undefined && entry.enabled !== enabled)
						mismatches.push(`enabled is ${entry.enabled}, expected ${enabled}`);
					if (
						skipOverageBilling !== undefined &&
						(entry.skip_overage_billing ?? false) !== skipOverageBilling
					)
						mismatches.push(
							`skip_overage_billing is ${entry.skip_overage_billing}, expected ${skipOverageBilling}`,
						);
					if (limitType !== undefined && entry.limit_type !== limitType)
						mismatches.push(
							`limit_type is ${entry.limit_type}, expected ${limitType}`,
						);
					if (
						overageLimit !== undefined &&
						entry.overage_limit !== overageLimit
					)
						mismatches.push(
							`overage_limit is ${entry.overage_limit}, expected ${overageLimit}`,
						);
				}
				return {
					name,
					score: mismatches.length === 0 ? 1 : 0,
					metadata:
						mismatches.length === 0
							? undefined
							: {
									why: mismatches.join("; "),
									spend_limits: spendLimits,
								},
				};
			},
		};
	},

	/** the customer's effective usage_alerts carry an enabled entry for the
	 * feature at the given threshold (+type) */
	usageAlertSet: ({
		featureId,
		threshold,
		thresholdType,
	}: {
		featureId: string;
		threshold: number;
		thresholdType?:
			| "usage"
			| "usage_percentage"
			| "remaining"
			| "remaining_percentage";
	}): Expectation => {
		const name = `usage alert set on ${featureId} at ${threshold}`;
		return {
			name,
			kind: "config",
			score: (output: AxRunOutput) => {
				const usageAlerts = output.oracle?.billing_controls?.usage_alerts ?? [];
				const entry = usageAlerts.find(
					(candidate) =>
						candidate.feature_id === featureId &&
						candidate.threshold === threshold &&
						(thresholdType === undefined ||
							candidate.threshold_type === thresholdType) &&
						candidate.enabled !== false,
				);
				return {
					name,
					score: entry ? 1 : 0,
					metadata: entry
						? undefined
						: {
								why: `no enabled usage_alerts entry for ${featureId} at threshold ${threshold}${thresholdType ? ` (${thresholdType})` : ""}`,
								usage_alerts: usageAlerts,
							},
				};
			},
		};
	},

	/** the customer's effective usage_limits carry an enabled entry for the
	 * feature whose provided fields all match (undefined fields not checked) */
	usageLimitSet: ({
		featureId,
		limit,
		interval,
	}: {
		featureId: string;
		limit?: number;
		interval?: "day" | "week" | "month" | "year";
	}): Expectation => {
		const name = `usage limit set on ${featureId}`;
		return {
			name,
			kind: "config",
			score: (output: AxRunOutput) => {
				const usageLimits = output.oracle?.billing_controls?.usage_limits ?? [];
				const entry = usageLimits.find(
					(candidate) => candidate.feature_id === featureId,
				);
				const mismatches: string[] = [];
				if (!entry) mismatches.push(`no usage_limits entry for ${featureId}`);
				else {
					if (entry.enabled === false) mismatches.push("entry is disabled");
					if (limit !== undefined && entry.limit !== limit)
						mismatches.push(`limit is ${entry.limit}, expected ${limit}`);
					if (interval !== undefined && entry.interval !== interval)
						mismatches.push(
							`interval is ${entry.interval}, expected ${interval}`,
						);
				}
				return {
					name,
					score: mismatches.length === 0 ? 1 : 0,
					metadata:
						mismatches.length === 0
							? undefined
							: {
									why: mismatches.join("; "),
									usage_limits: usageLimits,
								},
				};
			},
		};
	},

	/** the customer's effective overage_allowed carries an entry for the
	 * feature in the expected enabled state */
	overageAllowedSet: ({
		featureId,
		enabled,
	}: {
		featureId: string;
		enabled: boolean;
	}): Expectation => {
		const name = `overage_allowed ${enabled ? "enabled" : "disabled"} on ${featureId}`;
		return {
			name,
			kind: "config",
			score: (output: AxRunOutput) => {
				const overageAllowed =
					output.oracle?.billing_controls?.overage_allowed ?? [];
				const entry = overageAllowed.find(
					(candidate) => candidate.feature_id === featureId,
				);
				const passed = entry !== undefined && entry.enabled === enabled;
				return {
					name,
					score: passed ? 1 : 0,
					metadata: passed
						? undefined
						: {
								why: entry
									? `enabled is ${entry.enabled}, expected ${enabled}`
									: `no overage_allowed entry for ${featureId}`,
								overage_allowed: overageAllowed,
							},
				};
			},
		};
	},

	/** the feature's recorded usage in the org matches */
	usageRecorded: ({
		featureId,
		usage,
	}: {
		featureId: string;
		usage: number;
	}): Expectation => {
		const name = `usage recorded: ${usage} ${featureId}`;
		return {
			name,
			kind: "config",
			score: (output: AxRunOutput) => {
				const balance = output.oracle?.balances[featureId];
				const passed = balance?.usage === usage;
				return {
					name,
					score: passed ? 1 : 0,
					metadata: passed
						? undefined
						: {
								why: balance
									? `usage is ${balance.usage}, expected ${usage}`
									: `no balance for feature "${featureId}" on the customer`,
								balances: output.oracle?.balances,
							},
				};
			},
		};
	},

	/** the Nth probe call's JSON body must NOT match the pattern — catches
	 * wrong-source answers (e.g. customer-level granted where a per-plan
	 * breakdown figure belongs) */
	probeBodyLacks: (
		label: string,
		{ call, pattern }: { call: number; pattern: RegExp },
	): Expectation => ({
		name: label,
		kind: "config",
		score: (output: AxRunOutput) => {
			const probeCall = output.probe?.calls[call - 1];
			const passed =
				probeCall !== undefined && !pattern.test(JSON.stringify(probeCall.body));
			return {
				name: label,
				score: passed ? 1 : 0,
				metadata: passed
					? undefined
					: {
							why: probeCall
								? `call ${call}'s body matches forbidden ${pattern}`
								: `probe made only ${output.probe?.calls.length ?? 0} calls`,
							body: probeCall?.body,
						},
			};
		},
	}),
};

type OracleCusPlan = {
	plan_id?: string;
	id?: string;
	canceled_at?: number | null;
	status?: string;
};

/** Every listed plan is canceled or scheduled-to-cancel on the oracle
 * customer (canceled_at set, or the plan gone entirely). */
export const plansCanceled = ({
	planIds,
}: {
	planIds: string[];
}): Expectation => {
	const name = `plans canceled together: ${planIds.join(" + ")}`;
	return {
		name,
		kind: "config",
		score: (output: AxRunOutput) => {
			// Customer shape differs by API version: subscriptions (V5) or products (V3).
			const raw = output.oracle?.raw as
				| { subscriptions?: OracleCusPlan[]; products?: OracleCusPlan[] }
				| undefined;
			const cusPlans = [
				...(raw?.subscriptions ?? []),
				...(raw?.products ?? []),
			];
			const stillLive = planIds.filter((planId) =>
				cusPlans.some(
					(cusPlan) =>
						(cusPlan.plan_id ?? cusPlan.id) === planId &&
						cusPlan.canceled_at == null,
				),
			);
			return {
				name,
				score: stillLive.length === 0 ? 1 : 0,
				metadata:
					stillLive.length === 0
						? undefined
						: {
								why: `plans still active with no cancellation: [${stillLive.join(", ")}]`,
								cusPlans,
							},
			};
		},
	};
};
