import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const LIST_SCAN_CAP = 20_000;

/** Max customers one org-wide list page may walk before returning a short page. */
export const getListScanCap = ({ ctx }: { ctx: AutumnContext }) =>
	ctx.testOptions?.listScanCap ?? LIST_SCAN_CAP;
