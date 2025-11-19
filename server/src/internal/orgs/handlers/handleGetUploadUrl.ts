import { ErrCode } from "@autumn/shared";
import { getUploadUrl } from "@/external/supabase/storageUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { createRoute } from "../../../honoMiddlewares/routeHandler";

export const handleGetUploadUrl = createRoute({
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org } = ctx;

		const path = `logo/${org.id}`;

		if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
			throw new RecaseError({
				message: "Supabase storage not set up",
				code: ErrCode.SupabaseNotFound,
				statusCode: 400,
			});
		}

		const data = await getUploadUrl({ path });

		return c.json(data);
	},
});
