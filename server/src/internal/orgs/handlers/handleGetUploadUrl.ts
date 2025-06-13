import { getUploadUrl } from "@/external/supabase/storageUtils.js";
import RecaseError, { handleFrontendReqError } from "@/utils/errorUtils.js";
import { ErrCode } from "@autumn/shared";

export const handleGetUploadUrl = async (req: any, res: any) => {
  try {
    const { org, db, sb } = req;

    if (!sb) {
      throw new RecaseError({
        message: "Supabase not initialized, can't get signed URL",
        code: ErrCode.SupabaseNotFound,
      });
    }

    // Get signed URL
    let path = `logo/${org.id}`;

    const data = await getUploadUrl({ sb, path });

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
