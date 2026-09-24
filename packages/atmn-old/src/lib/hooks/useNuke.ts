/**
 * useNuke hook - Manages nuke operation with TanStack Query
 */

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
	deleteCustomersBatch,
	deleteFeaturesBatch,
	deletePlansBatch,
} from "../../commands/nuke/deletions.js";
import type {
	DeletionProgress,
	NukePhaseStats,
} from "../../commands/nuke/types.js";
import {
	type ApiCustomer,
	deleteCustomer,
	fetchAllCustomers,
} from "../api/endpoints/customers.js";
import { deleteFeature, fetchFeatures } from "../api/endpoints/features.js";
import { deletePlan, fetchPlans } from "../api/endpoints/plans.js";
import { AppEnv } from "../env/detect.js";
import { getKey } from "../env/index.js";

export interface UseNukeOptions {
	onComplete?: () => void;
	onError?: (error: Error) => void;
}

export interface UseNukeReturn {
	/** Start the nuke operation */
	nuke: () => void;
	/** Current phase statistics */
	phases: NukePhaseStats[];
	/** Currently active phase */
	activePhase: "customers" | "plans" | "features" | null;
	/** Total elapsed time in seconds */
	totalElapsed: number;
	/** Whether nuke is currently running */
	isNuking: boolean;
	/** Error if any */
	error: Error | null;
}

/**
 * Hook to manage nuke operation with progress tracking
 */
export function useNuke(options?: UseNukeOptions): UseNukeReturn {
	const [phases, setPhases] = useState<NukePhaseStats[]>([
		{ phase: "customers", current: 0, total: 0, rate: 0, completed: false },
		{ phase: "plans", current: 0, total: 0, rate: 0, completed: false },
		{ phase: "features", current: 0, total: 0, rate: 0, completed: false },
	]);
	const [activePhase, setActivePhase] = useState<
		"customers" | "plans" | "features" | null
	>(null);
	const [startTime, setStartTime] = useState<number>(0);
	const [currentElapsed, setCurrentElapsed] = useState<number>(0);

	// Update elapsed time periodically
	const updateElapsed = () => {
		if (startTime > 0) {
			setCurrentElapsed((Date.now() - startTime) / 1000);
		}
	};

	const updatePhase = (progress: DeletionProgress) => {
		setPhases((prev) =>
			prev.map((p) =>
				p.phase === progress.phase
					? {
							...p,
							current: progress.current,
							total: progress.total,
							rate: progress.rate || 0,
						}
					: p,
			),
		);
		updateElapsed();
	};

	const completePhase = (
		phase: "customers" | "plans" | "features",
		duration: number,
	) => {
		setPhases((prev) =>
			prev.map((p) =>
				p.phase === phase ? { ...p, completed: true, duration } : p,
			),
		);
		updateElapsed();
	};

	const nukeMutation = useMutation({
		mutationFn: async () => {
			const secretKey = getKey(AppEnv.Sandbox);
			setStartTime(Date.now());

			// Phase 1: Customers
			const customersPhaseStart = Date.now();
			setActivePhase("customers");

			const customers = await fetchAllCustomers({ secretKey });
			setPhases((prev) =>
				prev.map((p) =>
					p.phase === "customers" ? { ...p, total: customers.length } : p,
				),
			);

			await deleteCustomersBatch(
				customers.map((c: ApiCustomer) => ({ id: c.id })),
				async (id: string) => {
					await deleteCustomer({ secretKey, customerId: id });
				},
				updatePhase,
			);

			completePhase("customers", (Date.now() - customersPhaseStart) / 1000);

			// Phase 2: Plans
			const plansPhaseStart = Date.now();
			setActivePhase("plans");

			const plans = await fetchPlans({ secretKey, includeArchived: true });
			setPhases((prev) =>
				prev.map((p) =>
					p.phase === "plans" ? { ...p, total: plans.length } : p,
				),
			);

			await deletePlansBatch(
				plans.map((p) => ({ id: p.id })),
				async (id: string, allVersions: boolean) => {
					await deletePlan({ secretKey, planId: id, allVersions });
				},
				updatePhase,
			);

			completePhase("plans", (Date.now() - plansPhaseStart) / 1000);

			// Wait a bit for DB to propagate plan deletions
			// This prevents race conditions where features are still referenced
			await new Promise((resolve) => setTimeout(resolve, 1000));

			// Phase 3: Features
			const featuresPhaseStart = Date.now();
			setActivePhase("features");

			const features = await fetchFeatures({ secretKey });
			setPhases((prev) =>
				prev.map((p) =>
					p.phase === "features" ? { ...p, total: features.length } : p,
				),
			);

			await deleteFeaturesBatch(
				features.map((f) => ({ id: f.id, type: f.type })),
				async (id: string) => {
					await deleteFeature({ secretKey, featureId: id });
				},
				updatePhase,
			);

			completePhase("features", (Date.now() - featuresPhaseStart) / 1000);

			// Done!
			setActivePhase(null);
		},
		onSuccess: () => {
			if (options?.onComplete) {
				options.onComplete();
			}
		},
		onError: (error: Error) => {
			if (options?.onError) {
				options.onError(error);
			}
		},
	});

	return {
		nuke: () => nukeMutation.mutate(),
		phases,
		activePhase,
		totalElapsed: currentElapsed,
		isNuking: nukeMutation.isPending,
		error: nukeMutation.error,
	};
}
