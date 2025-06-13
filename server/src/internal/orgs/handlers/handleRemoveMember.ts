import { db } from "@/db/initDrizzle.js";
import { auth } from "@/utils/auth.js";
import RecaseError, { handleFrontendReqError } from "@/utils/errorUtils.js";
import { member } from "@autumn/shared";
import { eq } from "drizzle-orm";
import { Request, Response } from "express";

export const handleRemoveMember = async (req: Request, res: Response) => {
  const { memberId, organizationId } = req.body;

  try {
    let mem = await db.query.member.findFirst({
      where: eq(member.id, memberId),
    });

    if (!mem) {
      throw new RecaseError({
        message: "Member not found",
        code: "member_not_found",
        statusCode: 404,
      });
    }
    // const { data, error } = await auth.api.removeMember({
    //   body: {
    //     memberIdOrEmail: memberId,
    //     organizationId,
    //   },
    // });
  } catch (error) {
    handleFrontendReqError({
      error,
      res,
      req,
      action: "remove_member",
    });
  }
};
