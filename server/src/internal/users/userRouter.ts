import { Router } from "express";
import { z } from "zod";
import { routeHandler } from "@/utils/routerUtils.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { ExtendedResponse } from "@/utils/models/Request.js";
import { db } from "@/db/initDrizzle.js";
import { user as userTable } from "@autumn/shared";
import { eq } from "drizzle-orm";
import RecaseError from "@/utils/errorUtils.js";
import { ErrCode } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

export const userRouter: Router = Router();

userRouter.get("", async (req: any, res) => {
  res.status(200).json({ userId: req.userId });
});

// Schema for updating user profile
const UpdateUserSchema = z.object({
  name: z.string()
    .min(3, "Name must be at least 3 characters")
    .max(50, "Name must be at most 50 characters")
    .regex(/^[a-zA-Z0-9\s\-_]+$/, "Name can only contain letters, numbers, spaces, hyphens, and underscores"),
});

userRouter.put("/profile", async (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "PUT/users/profile",
    handler: async (req: ExtendedRequest, res: ExtendedResponse) => {
      const { userId, db } = req;
      
      const updateData = UpdateUserSchema.parse(req.body);
      
      const [updatedUser] = await db
        .update(userTable)
        .set({
          name: updateData.name,
          updatedAt: new Date(),
        })
        .where(eq(userTable.id, userId))
        .returning();
      
      if (!updatedUser) {
        throw new RecaseError({
          message: "User not found",
          code: ErrCode.InvalidRequest,
          statusCode: StatusCodes.NOT_FOUND,
        });
      }
      
      res.status(200).json({
        success: true,
        user: {
          id: updatedUser.id,
          name: updatedUser.name,
          email: updatedUser.email,
        },
      });
    },
  })
);
