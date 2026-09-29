/** The ECS task this worker runs in; both null off ECS, and the gate then fails open. */
export type TaskIdentity = {
	/** Stable across deploys and unique per Flightcontrol blue/green service: the sole gate signal. */
	serviceArn: string | null;
	/** Tagging only, never a gate signal: a stale SHA must not desync the fleet. */
	imageSha: string | null;
};
