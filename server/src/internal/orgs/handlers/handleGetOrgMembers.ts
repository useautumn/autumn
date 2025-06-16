import { handleFrontendReqError } from "@/utils/errorUtils.js";
import { OrgService } from "../OrgService.js";
import { auth } from "@/utils/auth.js";

export const handleGetOrgMembers = async (req: any, res: any) => {
  try {
    const { org, db } = req;
    const orgId = org.id;

    const memberships = await OrgService.getMembers({ db, orgId });
    const invites = await OrgService.getInvites({ db, orgId });

    res.status(200).json({
      memberships,
      invites,
    });
    // res.status(200).json({
    //   memberships: Array(10).fill(memberships[0]),
    //   invites: Array(10).fill(invites[0]),
    // });
  } catch (error) {
    handleFrontendReqError({
      req,
      error,
      res,
      action: "get org members",
    });
  }
};
