import type { Feature } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

export const createMockCtx = ({
	features,
}: {
	features: Feature[];
}): AutumnContext =>
	({
		features,
	}) as AutumnContext;

