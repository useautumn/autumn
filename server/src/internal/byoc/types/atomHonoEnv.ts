import type { AppEnv } from "@autumn/shared";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";

/** A request from an org's Atom: the org and env its token hash names, and its token as pushes carry it. */
export type AtomHonoEnv = {
	Variables: HonoEnv["Variables"] & {
		atom: { orgId: string; env: AppEnv; encryptedToken: string };
	};
};
