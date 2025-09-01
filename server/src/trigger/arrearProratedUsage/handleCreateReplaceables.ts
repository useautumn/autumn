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
