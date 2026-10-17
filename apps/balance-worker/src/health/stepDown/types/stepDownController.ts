export type StepDownController = {
	start(): void;
	stop(): Promise<void>;
};
