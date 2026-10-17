export type StepDownPermit = { slot: number; key: string };

export type StepDownPermitResult =
	| { ok: true; permit: StepDownPermit }
	| { ok: false; reason: "all_taken" | "unavailable"; cause?: unknown };

export type StepDownPermits = {
	acquire(): Promise<StepDownPermitResult>;
	renew(params: { permit: StepDownPermit }): Promise<boolean>;
	release(params: { permit: StepDownPermit }): Promise<void>;
};
