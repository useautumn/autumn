/** scripts/tw's 30% default kept ~770 idle workers through a full run's tail. */
const DEFAULT_CULL_BUFFER_FRACTION = "0.05";

export const swarmChildEnv = ({
	env,
}: {
	env: Record<string, string | undefined>;
}): Record<string, string> => ({
	TW_MODAL_NO_STALE: "1",
	TW_CULL_BUFFER_FRACTION:
		env.TW_CULL_BUFFER_FRACTION ?? DEFAULT_CULL_BUFFER_FRACTION,
});
