import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleAttachLicense } from "./handlers/handleAttachLicense.js";
import { handleListLicenseAssignments } from "./handlers/handleListLicenseAssignments.js";
import { handleListLicenses } from "./handlers/handleListLicenses.js";
import { handlePreviewAttachLicense } from "./handlers/handlePreviewAttachLicense.js";
import { handlePreviewUpdateLicense } from "./handlers/handlePreviewUpdateLicense.js";
import { handleUpdateLicense } from "./handlers/handleUpdateLicense.js";

export const licenseRpcRouter = new Hono<HonoEnv>();

licenseRpcRouter.post("/licenses.attach", ...handleAttachLicense);
licenseRpcRouter.post("/licenses.update", ...handleUpdateLicense);
licenseRpcRouter.post(
	"/licenses.preview_attach",
	...handlePreviewAttachLicense,
);
licenseRpcRouter.post(
	"/licenses.preview_update",
	...handlePreviewUpdateLicense,
);
licenseRpcRouter.post(
	"/licenses.list_assignments",
	...handleListLicenseAssignments,
);
licenseRpcRouter.post("/licenses.list", ...handleListLicenses);
