import type { AppEnv } from "@autumn/shared";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";

export type AtomHonoEnv = {
	Variables: HonoEnv["Variables"] & {
		atom: { orgId: string; env: AppEnv; encryptedToken: string };
	};
};
