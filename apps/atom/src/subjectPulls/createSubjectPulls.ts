import { AtomSubjectReadErrorCode } from "@autumn/byoc";
import type { AutumnLogger } from "@autumn/logging";
import { AutumnClientError } from "../autumnClient/autumnClientError.js";
import type { AutumnClient } from "../autumnClient/types/autumnClient.js";
import type { ThreadCounters } from "../threads/stats/threadStats.js";
import type {
	ApplyPulled,
	FolderSubjectPulls,
	SubjectPulls,
} from "./types/subjectPulls.js";

/** Per thread: bounds the load pulls put on Autumn, and slows them as Autumn slows. */
export const MAX_PULLS_IN_FLIGHT = 8;
/** A subject is pulled at most once per hold, whatever Autumn answers; herald's pushes keep a stored one fresh. */
export const PULL_HOLD_MS = 30_000;

type SubjectPullsContext = {
	autumnClient: Pick<AutumnClient, "readSubject">;
	counters: Pick<ThreadCounters, "add">;
	logger: Pick<AutumnLogger, "warn">;
	now?: () => number;
};

const autumnRefusalOf = (error: unknown): string | null =>
	error instanceof AutumnClientError ? error.code : null;

/** Autumn does not know the folder's token, as for our shadow Atom: the whole folder is held. */
const isAtomUnknown = (error: unknown): boolean =>
	autumnRefusalOf(error) === AtomSubjectReadErrorCode.AtomUnknown;

/** Autumn has no subject this Atom may hold: an expected answer, not a failure. */
const isSubjectUnavailable = (error: unknown): boolean => {
	const code = autumnRefusalOf(error);
	return (
		code === AtomSubjectReadErrorCode.SubjectNotFound ||
		code === AtomSubjectReadErrorCode.SubjectNotHeld
	);
};

const subjectKeyOf = ({
	customerId,
	entityId,
}: {
	customerId: string;
	entityId: string | null;
}) => (entityId === null ? customerId : `${customerId}\u0000${entityId}`);

/** A miss pulls its subject from Autumn beside the forward, never instead of it, and stores it as a push would. */
export const createSubjectPulls = ({
	ctx,
}: {
	ctx: SubjectPullsContext;
}): SubjectPulls => {
	const now = ctx.now ?? (() => performance.now());
	let stopped = false;
	let inFlight = 0;
	let failureLoggedAt = Number.NEGATIVE_INFINITY;

	/** At most one warning per hold per thread, so an Autumn that is down cannot flood the logs. */
	function logFailure({ error }: { error: unknown }): void {
		const at = now();
		if (at - failureLoggedAt < PULL_HOLD_MS) return;
		failureLoggedAt = at;
		ctx.logger.warn(
			{ type: "atom_subject_pull_failed", error },
			"Could not pull a subject the Atom missed from Autumn; its checks still go to the API",
		);
	}

	function forFolder({
		tokenHash,
		applyPulled,
	}: {
		tokenHash: () => string;
		applyPulled: ApplyPulled;
	}): FolderSubjectPulls {
		// Every hold is equally long, so insertion order is expiry order and expired holds leave from the front.
		const heldUntil = new Map<string, number>();
		let folderHeldUntil = Number.NEGATIVE_INFINITY;

		function isHeld({ key, at }: { key: string; at: number }): boolean {
			for (const [heldKey, until] of heldUntil) {
				if (until > at) break;
				heldUntil.delete(heldKey);
			}
			return folderHeldUntil > at || heldUntil.has(key);
		}

		async function pull({
			customerId,
			entityId,
		}: {
			customerId: string;
			entityId: string | null;
		}): Promise<void> {
			try {
				const body = await ctx.autumnClient.readSubject({
					tokenHash: tokenHash(),
					customerId,
					entityId,
				});
				if (stopped) return;
				if (await applyPulled({ customerId, body }))
					ctx.counters.add("subjectFills");
			} catch (error) {
				if (stopped || isSubjectUnavailable(error)) return;
				if (isAtomUnknown(error)) folderHeldUntil = now() + PULL_HOLD_MS;
				else logFailure({ error });
			} finally {
				inFlight -= 1;
			}
		}

		function request({
			customerId,
			entityId,
		}: {
			customerId: string;
			entityId: string | null;
		}): void {
			ctx.counters.add("subjectMisses");
			const key = subjectKeyOf({ customerId, entityId });
			const at = now();
			if (stopped || inFlight >= MAX_PULLS_IN_FLIGHT || isHeld({ key, at }))
				return;
			heldUntil.set(key, at + PULL_HOLD_MS);
			inFlight += 1;
			ctx.counters.add("subjectPulls");
			void pull({ customerId, entityId });
		}

		return { request };
	}

	return {
		forFolder,
		stop: () => {
			stopped = true;
		},
	};
};
