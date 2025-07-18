import { ExtendedResponse } from "@/utils/models/Request.js";
import { AppEnv, ErrCode } from "@autumn/shared";
import { readFile } from "@/external/supabase/storageUtils.js";
import { FeatureService } from "@/internal/features/FeatureService.js";

export const trmnlExclusions = ["/trmnl/screen"];

export const trmnlAuthMiddleware = async (
  req: any,
  res: ExtendedResponse,
  next: any
) => {
  const logger = req.logtail;

  const file = await readFile({ bucket: "private", path: "trmnl.json" });
  const fileString = await file.text();
  const fileJson = JSON.parse(fileString);

  let trmnlId = req.headers["x-trmnl-id"];
  if (!trmnlId)
    return res.status(401).json({
      message: "Trmnl ID not found",
      code: ErrCode.InvalidSecretKey,
      statusCode: 401,
    });

  if (!fileJson[trmnlId]) {
    return res.status(401).json({
      message: "Trmnl ID not found",
      code: ErrCode.InvalidSecretKey,
      statusCode: 401,
    });
  }

  const features = await FeatureService.list({
    db: req.db,
    orgId: fileJson[trmnlId],
    env: req.headers["env"] || AppEnv.Live,
  });

  req.org = {
    id: fileJson[trmnlId],
    env: req.headers["env"] || AppEnv.Live,
  };
  req.features = features;

  next();
};
