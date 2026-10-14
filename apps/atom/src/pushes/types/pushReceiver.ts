export type PushReceiver = {
	run(): Promise<void>;
	stop(): void;
};
