// "allow" is internal-only: the public API accepts cap | overflow | reject.
export type OverageBehaviour = "cap" | "overflow" | "reject" | "allow";

export type DeductionOptions = {
	overageBehaviour: OverageBehaviour;
	isAllow: boolean;
	isConsumption: boolean;
};
