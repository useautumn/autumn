import { DrizzleCli } from "@/db/initDrizzle.js";
import { findLinkedCusEnts } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils/findCusEntUtils.js";
import { RepService } from "@/internal/customers/cusProducts/cusEnts/RepService.js";
import { generateId } from "@/utils/genUtils.js";
import {
  FullCusEntWithFullCusProduct,
  FullCusEntWithProduct,
  InsertReplaceableSchema,
} from "@autumn/shared";

// export const handleCreateReplaceables = async ({
//   db,
//   prevOverage,
//   newOverage,
//   cusEnt,
//   logger,
// }: {
//   db: DrizzleCli;
//   prevOverage: number;
//   newOverage: number;
//   cusEnt: FullCusEntWithFullCusProduct;
//   logger: any;
// }) => {
//   if (prevOverage <= newOverage) {
//     logger.info("No replaceables needed");
//     return [];
//   }
//   logger.info(`Prev overage: ${prevOverage}, New overage: ${newOverage}`);

//   let numReplaceables = prevOverage - newOverage;
//   let newReplaceables = Array.from({ length: numReplaceables }, (_, i) =>
//     InsertReplaceableSchema.parse({
//       id: generateId("rep"),
//       cus_ent_id: cusEnt.id,
//       created_at: Date.now(),
//       delete_next_cycle: true,
//     }),
//   );

//   return await RepService.insert({
//     db,
//     data: newReplaceables,
//   });
// };
