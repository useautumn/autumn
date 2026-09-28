export type EnvironmentSelection =
	| { kind: "production" }
	| { kind: "defaultSandbox" }
	| { kind: "sandbox"; sandboxId: string };
