import type { AppEnv } from "@autumn/shared";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";

/** A request from an org's Atom: the Atom its token hash names, its org and env, and its token as pushes carry it. */
export type AtomHonoEnv = {
	Variables: HonoEnv["Variables"] & {
		atom: { id: string; orgId: string; env: AppEnv; encryptedToken: string };
	};
};
