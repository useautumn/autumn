import { DELETE_CONCURRENCY } from "../../constants.js";
import type { DeletionProgress } from "./types.js";

export async function deleteCustomersBatch(
	customers: { id: string }[],
	deleteCustomerFn: (id: string) => Promise<void>,
	onProgress?: (progress: DeletionProgress) => void,
): Promise<void> {
	const concurrency = Math.max(
		1,
		Math.min(customers.length, DELETE_CONCURRENCY),
	);

	let completed = 0;
	const startTime = Date.now();

	for (let i = 0; i < customers.length; i += concurrency) {
		const batch = customers.slice(i, i + concurrency);

		await Promise.all(
			batch.map(async (customer) => {
				await deleteCustomerFn(customer.id);
				completed++;

				if (onProgress) {
					const elapsed = (Date.now() - startTime) / 1000;
					const rate = elapsed > 0 ? completed / elapsed : 0;

					onProgress({
						phase: "customers",
						current: completed,
						total: customers.length,
						rate,
					});
				}
			}),
		);
	}
}

export async function deletePlansBatch(
	plans: { id: string }[],
	deletePlanFn: (id: string, allVersions: boolean) => Promise<void>,
	onProgress?: (progress: DeletionProgress) => void,
): Promise<void> {
	const concurrency = Math.max(1, Math.min(plans.length, DELETE_CONCURRENCY));

	let completed = 0;
	const startTime = Date.now();

	for (let i = 0; i < plans.length; i += concurrency) {
		const batch = plans.slice(i, i + concurrency);

		await Promise.all(
			batch.map(async (plan) => {
				await deletePlanFn(plan.id, true);
				completed++;

				if (onProgress) {
					const elapsed = (Date.now() - startTime) / 1000;
					const rate = elapsed > 0 ? completed / elapsed : 0;

					onProgress({
						phase: "plans",
						current: completed,
						total: plans.length,
						rate,
					});
				}
			}),
		);
	}
}

/**
 * @deprecated Use deletePlansBatch instead
 */
export const deletePlansSequential = deletePlansBatch;

export async function deleteFeaturesBatch(
	features: { id: string; type: string }[],
	deleteFeatureFn: (id: string) => Promise<void>,
	onProgress?: (progress: DeletionProgress) => void,
): Promise<void> {
	const creditSystems = features.filter((f) => f.type === "credit_system");
	const otherFeatures = features.filter((f) => f.type !== "credit_system");

	const total = features.length;
	let completed = 0;
	const startTime = Date.now();

	const reportProgress = () => {
		if (onProgress) {
			const elapsed = (Date.now() - startTime) / 1000;
			const rate = elapsed > 0 ? completed / elapsed : 0;

			onProgress({
				phase: "features",
				current: completed,
				total,
				rate,
			});
		}
	};

	if (creditSystems.length > 0) {
		const concurrency = Math.max(
			1,
			Math.min(creditSystems.length, DELETE_CONCURRENCY),
		);

		for (let i = 0; i < creditSystems.length; i += concurrency) {
			const batch = creditSystems.slice(i, i + concurrency);

			await Promise.all(
				batch.map(async (feature) => {
					await deleteFeatureFn(feature.id);
					completed++;
					reportProgress();
				}),
			);
		}
	}

	if (otherFeatures.length > 0) {
		const concurrency = Math.max(
			1,
			Math.min(otherFeatures.length, DELETE_CONCURRENCY),
		);

		for (let i = 0; i < otherFeatures.length; i += concurrency) {
			const batch = otherFeatures.slice(i, i + concurrency);

			await Promise.all(
				batch.map(async (feature) => {
					await deleteFeatureFn(feature.id);
					completed++;
					reportProgress();
				}),
			);
		}
	}
}

/**
 * @deprecated Use deleteFeaturesBatch instead
 */
export const deleteFeaturesSequential = deleteFeaturesBatch;
