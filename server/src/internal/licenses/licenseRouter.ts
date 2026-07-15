import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleAttachLicense } from "./handlers/handleAttachLicense.js";
import { handleListLicenseAssignments } from "./handlers/handleListLicenseAssignments.js";
import { handleListLicenses } from "./handlers/handleListLicenses.js";
import { handleReleaseLicense } from "./handlers/handleReleaseLicense.js";

export const licenseRpcRouter = new Hono<HonoEnv>();

licenseRpcRouter.post("/licenses.attach", ...handleAttachLicense);
licenseRpcRouter.post("/licenses.release", ...handleReleaseLicense);
licenseRpcRouter.post(
	"/licenses.list_assignments",
	...handleListLicenseAssignments,
);
licenseRpcRouter.post("/licenses.list", ...handleListLicenses);
