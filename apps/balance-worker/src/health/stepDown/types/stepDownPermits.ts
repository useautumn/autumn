export type StepDownPermit = {
	slot: number;
	key: string;
	acquisitionId: string;
};

export type StepDownPermitResult =
	| { ok: true; permit: StepDownPermit }
	| { ok: false; reason: "all_taken" | "unavailable"; cause?: unknown };

export type StepDownPermits = {
	acquire(): Promise<StepDownPermitResult>;
	release(params: { permit: StepDownPermit }): Promise<void>;
};
