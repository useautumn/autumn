/** The rig's one config: every spike after this is first an edit here (Bun JSC flags, threads, keep-alive, the mix). */
const defaults = {
	/** Which code the boxes run; set by the branch, recorded in every run. */
	variant: "chain-top" as "chain-top" | "chain-top+4765",
	/** What rig:driver runs: the stepped hot customer, or a rolling deploy under steady load (rig:roll). */
	mode: "steps" as "steps" | "roll",
	tenant: {
		atomId: "atom_rig",
		token: "atom_token_rig",
		adminToken: "atom_admin_rig",
		secretKey: "am_sk_test_rig",
	},
	/** As the shadow's release runs a replica: multi-tenant, 128 slots per org. */
	replica: {
		port: 8790,
		peerPort: 8791,
		threads: 3,
		slotCount: 128,
		/** The supervisor's control port on each replica box (stop, start, peers, status); the driver scripts the roll through it. */
		controlPort: 8799,
		nodeEnv: "production",
		/** Passed to the replica's Bun as environment, e.g. { BUN_JSC_useJIT: "1" }. */
		bunJscFlags: {} as Record<string, string>,
		extraEnv: {} as Record<string, string>,
	},
	stub: {
		port: 18877,
		/** Herald's push lag, sampled log-normally from its p50 and p99. */
		pushLagP50Ms: 350,
		pushLagP99Ms: 1_200,
		seedConcurrency: 64,
		/** http posts each push to a random replica; queue enqueues it for the replicas' push receivers, as herald's SQS queue does. */
		pushVia: "http" as "http" | "queue",
	},
	customers: { count: 7_000, hotCustomerId: "cus_hot" },
	background: {
		/** Resend's 1× surge peak across the pair. */
		deductionsPerSec: 1_300,
		/** Non-deducting checks per deduction: 4.8 checks per deduction overall. */
		readChecksPerDeduction: 3.8,
		/** Each customer's share of the rate, drawn from these quantiles of per-customer deductions/s. */
		ratePerCustomer: { p50: 1, p99: 12, p999: 76 },
		/** flat holds the peak; snapshot300s ramps to it at T+90 s and holds, as the replay's snapshot. */
		shape: "flat" as "flat" | "snapshot300s",
	},
	hot: {
		/** The hot customer's deductions/s per step multiple, as #351. */
		ratePerStep: 20.7,
		steps: [4, 8, 12, 16, 20, 30, 40, 50, 60, 80, 100, 120],
		maxRatePerSec: 2_500,
		stepSeconds: 10,
		readChecksPerDeduction: 0.6,
		/** Every hot deduction is a locked check (1 unit under a lock id) settled by a finalize `finalizeAfterMs` later; off sends plain deductions. */
		lock: { enabled: false, finalizeAfterMs: 5_000 },
	},
	/** How a deduction is sent: a send_event check, as the shadow mirrors one, or `/v1/track`. */
	deductionRoute: "check" as "check" | "track",
	/**
	 * A rolling deploy as Alien rolls a release (measured on dep_tco9, 2026-10-13): one replica at a time, deregistered from
	 * the ALB and still serving for 12 s, then SIGTERM; its atom.svc record stays until the container is removed, 11–14 s
	 * after it exits; the new container starts on the same volume ~10 s later and is listed in atom.svc at once; the ALB
	 * sends to it again ~15 s after /health is 200, and the next replica's swap starts then.
	 */
	roll: {
		deductionsPerSec: 300,
		readChecksPerDeduction: 3.8,
		warmupSeconds: 30,
		settleSeconds: 30,
		order: ["a", "b"] as ("a" | "b")[],
		deregisterToSigtermMs: 12_000,
		exitToDnsDropMs: 12_000,
		dnsDropToStartMs: 10_000,
		readyToRegisteredMs: 15_000,
		/** One deduction in this many is a locked check (lock_id held, 1 unit), finalized `lockFinalizeAfterMs` later; 0 sends none. */
		lockEvery: 0,
		lockFinalizeAfterMs: 8_000,
	},
	warmupSeconds: 20,
	healthEveryMs: 10_000,
	/** Load generator processes on the driver box; the generator must never be the bottleneck. */
	loadProcesses: 6,
	requestTimeoutMs: 5_000,
	/** Whether the generator reuses connections (Bun's fetch keep-alive). */
	keepAlive: true,
};

export type RigConfig = typeof defaults;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const mergeInto = (base: unknown, override: unknown): unknown => {
	if (!isRecord(base) || !isRecord(override)) return override ?? base;
	return Object.fromEntries(
		[...new Set([...Object.keys(base), ...Object.keys(override)])].map(
			(key) => [
				key,
				key in override ? mergeInto(base[key], override[key]) : base[key],
			],
		),
	);
};

/** The defaults with RIG_OVERRIDES (JSON, deep-merged; arrays replace) on top, the same on every box and process. */
export const rigConfig = mergeInto(
	defaults,
	JSON.parse(process.env.RIG_OVERRIDES ?? "{}"),
) as RigConfig;
