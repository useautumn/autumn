import type { TrackDecision } from "@autumn/balance-engine";
import type { RuntimeRequestTracker } from "./types/partitionRuntime.js";

export function createRequestTracker(): RuntimeRequestTracker {
	const activeOperations = new Set<Promise<unknown>>();
	const tracksByCustomer = new Map<string, Set<Promise<TrackDecision>>>();

	function register<Result>({
		operation,
	}: {
		operation: Promise<Result>;
	}): Promise<Result> {
		activeOperations.add(operation);
		void forgetCompletedRequest({ operation });
		return operation;
	}

	async function forgetCompletedRequest({
		operation,
	}: {
		operation: Promise<unknown>;
	}): Promise<void> {
		try {
			await operation;
		} catch {
			// The caller owns the rejection; tracking only observes settlement.
		} finally {
			activeOperations.delete(operation);
		}
	}

	function registerTrack({
		customerKey,
		operation,
	}: {
		customerKey: string;
		operation: Promise<TrackDecision>;
	}): Promise<TrackDecision> {
		const customerTracks =
			tracksByCustomer.get(customerKey) ?? new Set<Promise<TrackDecision>>();
		customerTracks.add(operation);
		tracksByCustomer.set(customerKey, customerTracks);
		void forgetCompletedTrack({ customerKey, customerTracks, operation });
		return register({ operation });
	}

	async function forgetCompletedTrack({
		customerKey,
		customerTracks,
		operation,
	}: {
		customerKey: string;
		customerTracks: Set<Promise<TrackDecision>>;
		operation: Promise<TrackDecision>;
	}): Promise<void> {
		try {
			await operation;
		} catch {
			// Rejected tracks must also leave the customer's pending work.
		} finally {
			customerTracks.delete(operation);
			if (customerTracks.size === 0) tracksByCustomer.delete(customerKey);
		}
	}

	function precedingTracks({
		customerKey,
	}: {
		customerKey: string;
	}): Promise<TrackDecision>[] {
		// Later tracks cannot extend a check's wait.
		return [...(tracksByCustomer.get(customerKey) ?? [])];
	}

	async function drain(): Promise<void> {
		await Promise.allSettled([...activeOperations]);
	}

	return { register, registerTrack, precedingTracks, drain };
}
