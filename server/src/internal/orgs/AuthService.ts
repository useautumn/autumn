// import { db } from "@/db/initDrizzle.js";
// import { OrgService } from "./OrgService.js";
// import { DrizzleCli } from "@/db/initDrizzle.js";
// import { member, organizations } from "@autumn/shared";
// import { generateId } from "@/utils/genUtils.js";

// export class AuthService {
//   static async createOrg({
//     db,
//     name,
//     slug,
//     userId,
//   }: {
//     db: DrizzleCli;
//     name: string;
//     slug: string;
//     userId: string;
//   }) {
//     // 1. Create org
//     await db.insert(organizations).values({
//       id: generateId("org"),
//       name,
//       slug,
//       createdAt: new Date(),
//     });

//     await db.insert(member).values({
//       id: generateId("mem"),
//       organizationId: org.id,
//       userId,
//       createdAt: new Date(),
//     });
//   }
// }
