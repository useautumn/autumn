import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const LIST_SCAN_CAP = 20_000;

export const getListScanCap = ({ ctx }: { ctx: AutumnContext }) =>
	ctx.testOptions?.listScanCap ?? LIST_SCAN_CAP;
