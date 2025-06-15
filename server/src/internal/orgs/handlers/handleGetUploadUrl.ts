import { logger } from "@/external/logtail/logtailUtils.js";
import { getUploadUrl } from "@/external/supabase/storageUtils.js";
import RecaseError, { handleFrontendReqError } from "@/utils/errorUtils.js";
import { ErrCode } from "@autumn/shared";

export const handleGetUploadUrl = async (req: any, res: any) => {
  try {
    const { org } = req;

    let path = `logo/${org.id}`;

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      logger.warn("Supabase storage not set up");
      res.status(400).json({
        message: "Supabase storage not set up",
        code: ErrCode.SupabaseNotFound,
      });
      return;
    }

    const data = await getUploadUrl({ path });

    res.status(200).json(data);
  } catch (error) {
    handleFrontendReqError({
      req,
      error,
      res,
      action: "get upload url",
    });
  }
};
