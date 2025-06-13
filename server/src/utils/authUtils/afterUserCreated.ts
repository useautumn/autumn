import { invitation } from "@autumn/shared";
import { eq } from "drizzle-orm";
import { User } from "better-auth";
import { db } from "@/db/initDrizzle.js";
import { auth } from "@/utils/auth.js";

export const afterUserCreated = async (user: User) => {
  // let invites = await db
  //   .select()
  //   .from(invitation)
  //   .where(eq(invitation.email, user.email));
  // for (const invite of invites) {
  //   try {
  //     await auth.api.addMember({
  //       body: {
  //         userId: user.id,
  //         role: invite.role as any,
  //         organizationId: invite.organizationId,
  //       },
  //     });
  //     // await db
  //     //   .update(invitation)
  //     //   .set({
  //     //     status: "accepted",
  //     //   })
  //     //   .where(eq(invitation.id, invite.id));
  //   } catch (error) {
  //     console.error("Error accepting invitation", error);
  //   }
  // }
  // If no invites, then
};
