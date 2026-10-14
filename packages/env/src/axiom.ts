const trimmed = (value: string | undefined): string | null =>
	value?.trim() || null;

export function createAxiomEnv(runtimeEnv: Record<string, string | undefined>) {
	return {
		AXIOM_ADMIN_TOKEN: trimmed(runtimeEnv.AXIOM_ADMIN_TOKEN),
		AXIOM_ORG_ID: trimmed(runtimeEnv.AXIOM_ORG_ID),
		AXIOM_ATOM_ADMIN_TOKEN: trimmed(runtimeEnv.AXIOM_ATOM_ADMIN_TOKEN),
	};
}

export type AxiomEnv = ReturnType<typeof createAxiomEnv>;
let axiomEnv: AxiomEnv | undefined;

export function getAxiomEnv(): AxiomEnv {
	axiomEnv ??= createAxiomEnv(process.env);
	return axiomEnv;
}
