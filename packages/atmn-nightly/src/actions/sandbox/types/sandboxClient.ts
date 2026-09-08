import type { AutumnClient } from "../../../generated/client";

/** The three operations `atmn sandbox` needs, so a test can hand over a fake. */
export type SandboxClient = Pick<
	AutumnClient,
	"createSandbox" | "listSandboxes" | "deleteSandbox"
>;

/** Where a command writes its progress. Injected so tests can capture it. */
export type WriteLine = (text: string) => void;
