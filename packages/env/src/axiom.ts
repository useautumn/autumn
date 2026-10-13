const trimmed = (value: string | undefined): string | null =>
	value?.trim() || null;

/** The Axiom tokens a process queries logs with; each is null where unset, which turns its log search off. */
export function createAxiomEnv(runtimeEnv: Record<string, string | undefined>) {
	return {
		/** Personal token that reads Autumn's own request logs. */
		AXIOM_ADMIN_TOKEN: trimmed(runtimeEnv.AXIOM_ADMIN_TOKEN),
		AXIOM_ORG_ID: trimmed(runtimeEnv.AXIOM_ORG_ID),
		/** Reads only the dataset every Atom's logs are exported to. */
		AXIOM_ATOM_ADMIN_TOKEN: trimmed(runtimeEnv.AXIOM_ATOM_ADMIN_TOKEN),
	};
}

export type AxiomEnv = ReturnType<typeof createAxiomEnv>;
let axiomEnv: AxiomEnv | undefined;

/** Read at first use, never at import: env may be injected after import (infisical). */
export function getAxiomEnv(): AxiomEnv {
	axiomEnv ??= createAxiomEnv(process.env);
	return axiomEnv;
}
