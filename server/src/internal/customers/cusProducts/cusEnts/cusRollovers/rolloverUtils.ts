import {
	type EntityRolloverBalance,
	type FullCustomerEntitlement,
	type Rollover,
	type RolloverConfig,
	RolloverDuration,
} from "@autumn/shared";
import { addMonths } from "date-fns";
import { Decimal } from "decimal.js";
import { generateId, notNullish, nullish } from "@/utils/genUtils.js";

export const getRolloverUpdates = ({
	cusEnt,
	nextResetAt,
}: {
	cusEnt: FullCustomerEntitlement;
	nextResetAt: number;
}) => {
	const update: {
		toDelete: string[];
		toInsert: Rollover[];
		toUpdate: Rollover[];
	} = {
		toDelete: [],
		toInsert: [],
		toUpdate: [],
	};
	const ent = cusEnt.entitlement;
	const shouldRollover =
		cusEnt.balance && cusEnt.balance > 0 && notNullish(ent.rollover);

	if (!shouldRollover) return update;

	const nextExpiry = calculateNextExpiry(nextResetAt, ent.rollover!);

	const newRollover: Rollover = {
		id: generateId("roll"),
		cus_ent_id: cusEnt.id,
		balance: 0,
		usage: 0,
		expires_at: nextExpiry,
		entities: {},
	};

	if (notNullish(ent.entity_feature_id)) {
		for (const entityId in cusEnt.entities) {
			const entRollover = cusEnt.entities[entityId].balance;

			if (entRollover > 0) {
				newRollover.entities[entityId] = {
					id: entityId,
					balance: entRollover,
					usage: 0,
				};
			}
		}

		update.toInsert.push(newRollover);
	} else {
		const balance = cusEnt.balance!;
		if (balance > 0) {
			newRollover.balance = balance;
			update.toInsert.push(newRollover);
		}
	}

	return update;
};

export const calculateNextExpiry = (
	nextResetAt: number,
	config: RolloverConfig,
) => {
	if (nullish(config)) {
		return null;
	}

	if (config.duration === RolloverDuration.Forever) return null;

	return addMonths(nextResetAt, config.length).getTime();
};

export function performMaximumClearing({
	rows,
	// rolloverConfig,
	cusEnt,
	// cusEntID,
	// entityMode,
}: {
	rows: Rollover[];
	// rolloverConfig: RolloverConfig;
	cusEnt: FullCustomerEntitlement;
	// cusEntID: string;
	// entityMode: boolean;
}) {
	const rolloverConfig = cusEnt.entitlement.rollover;

	if (!rolloverConfig) {
		return { toDelete: [], toUpdate: [] };
	}

	if (rolloverConfig.max == null) {
		return { toDelete: [], toUpdate: [] };
	}

	const _total = 0;
	const _toDelete: string[] = [];
	const _toUpdate: Rollover[] = [];

	// look through each row
	// if entityMode is true, then look through each entity
	// otherwise look at balance

	// sort by the oldest first
	// add the balance of the oldest to the total
	// if the total is greater than or equal to the max, then:
	// subtract the max from the total, if theres a difference then instantiate the updated row object and push to toUpdate
	// if theres no difference, then push to toDelete
	// move to the next row
	// if the total is less than the max, then
	// move to the next row

	rows.sort((a, b) => {
		if (a.expires_at && b.expires_at) return a.expires_at - b.expires_at;
		if (a.expires_at && !b.expires_at) return -1;
		if (!a.expires_at && b.expires_at) return 1;
		return 0;
	});

	const ent = cusEnt.entitlement;
	const entityMode = !!ent.entity_feature_id;

	if (!entityMode) {
		const totalRolloverBalance = rows.reduce(
			(acc, row) => acc + row.balance,
			0,
		);
		let toDeduct = new Decimal(totalRolloverBalance).sub(rolloverConfig.max);

		if (toDeduct.lt(0)) return { toDelete: [], toUpdate: [] };

		const toUpdate: Rollover[] = [];
		const toDelete: string[] = [];

		for (const row of rows) {
			const curBalance = new Decimal(row.balance);
			let newBalance = curBalance;
			if (curBalance.gte(toDeduct)) {
				newBalance = newBalance.sub(toDeduct);
				toDeduct = new Decimal(0);

				toUpdate.push({ ...row, balance: newBalance.toNumber() });
			} else {
				newBalance = new Decimal(0);
				toDeduct = toDeduct.sub(curBalance);

				toDelete.push(row.id);
			}

			if (toDeduct.lte(0)) break;
		}

		return { toDelete, toUpdate };
	} else {
		const allEntityIds = new Set<string>();
		rows.forEach((row) => {
			if (row.entities && Array.isArray(row.entities)) {
				row.entities.forEach((entity: EntityRolloverBalance) => {
					if (entity.id) {
						allEntityIds.add(entity.id);
					}
				});
			}
		});

		const entityTotals = new Map<string, number>();
		allEntityIds.forEach((id) => {
			entityTotals.set(id, 0);
		});
		const entityIdToTotal: Record<string, number> = {};
		rows.forEach((row) => {
			for (const entityId in row.entities) {
				entityIdToTotal[entityId] =
					(entityIdToTotal[entityId] || 0) + row.entities[entityId].balance;
			}
		});

		// console.log(`id to total:`, entityIdToTotal);

		const toUpdate: Rollover[] = [];
		const toDelete: string[] = [];

		// Non entity mode
		for (const row of rows) {
			const update = structuredClone(row);
			let shouldUpdate = false;

			for (const entityId in entityIdToTotal) {
				const entityTotal = entityIdToTotal[entityId];
				const toDeduct = new Decimal(entityTotal).sub(rolloverConfig.max);

				if (toDeduct.lte(0) || !row.entities[entityId]) continue;
				// console.log(`Entity ${entityId}, deducting ${toDeduct.toNumber()}`);

				const curBalance = new Decimal(row.entities[entityId].balance);
				let newBalance = curBalance;

				if (curBalance.gte(toDeduct)) {
					newBalance = newBalance.sub(toDeduct);
					entityIdToTotal[entityId] = 0;
					shouldUpdate = true;
					update.entities[entityId] = {
						id: entityId,
						balance: newBalance.toNumber(),
						usage: 0,
					};
				} else {
					newBalance = new Decimal(0);
					entityIdToTotal[entityId] = toDeduct.sub(curBalance).toNumber();
					shouldUpdate = true;
					update.entities[entityId] = {
						id: entityId,
						balance: 0,
						usage: 0,
					};
				}
			}
			// console.log(`Max clearing for row ${row.id}`);
			// console.log(`Update:`, update.entities);

			// If all keys are 0, then delete the row
			if (
				Object.values(update.entities).every(
					(entity: EntityRolloverBalance) => entity.balance === 0,
				)
			) {
				toDelete.push(row.id);
			} else if (shouldUpdate) {
				toUpdate.push(update);
			}
		}

		return { toDelete, toUpdate };
	}
}

// For each entity ID, perform maximum clearing...

// console.log(
//   `🔍 Found ${allEntityIds.size} unique entity IDs: ${Array.from(allEntityIds).join(", ")}`
// );

// Sort rows by expiry date (oldest first)
// rows.sort((a, b) => a.expires_at - b.expires_at);
// console.log(`📅 Sorted rows by expiry date (oldest first)`);

// Track totals per entity ID

//   for (let i = 0; i < rows.length; i++) {
//     let row = rows[i];
//     // console.log(`\n🔍 Processing row ${i + 1}/${rows.length}:`);
//     // console.log(`  - Row ID: ${row.id}`);
//     // console.log(`  - Expires at: ${new Date(row.expires_at).toISOString()}`);

//     if (!row.entities || !Array.isArray(row.entities)) {
//       console.log(`  - ⚠️ Row has no entities array, skipping`);
//       continue;
//     }

//     let rowNeedsUpdate = false;
//     let updatedEntities = [...row.entities];

//     // Process each entity in this row
//     for (let j = 0; j < updatedEntities.length; j++) {
//       const entity = updatedEntities[j];
//       if (!entity.id || !entity.balance) {
//         // console.log(`    - ⚠️ Entity missing id or balance, skipping`);
//         continue;
//       }

//       const currentTotal = entityTotals.get(entity.id) || 0;
//       const newTotal = currentTotal + entity.balance;

//       console.log(
//         `    - Entity ${entity.id}: balance=${entity.balance}, currentTotal=${currentTotal}, newTotal=${newTotal}`
//       );

//       if (newTotal > rolloverConfig.max) {
//         const excess = newTotal - rolloverConfig.max;
//         const newBalance = entity.balance - excess;

//         console.log(
//           `      - ⚠️ Total exceeds maximum (${rolloverConfig.max})`
//         );
//         console.log(`      - Excess to remove: ${excess}`);
//         console.log(
//           `      - Updating entity balance from ${entity.balance} to ${newBalance}`
//         );

//         if (newBalance > 0) {
//           updatedEntities[j] = { ...entity, balance: newBalance };
//           entityTotals.set(entity.id, rolloverConfig.max);
//           rowNeedsUpdate = true;
//         } else {
//           console.log(`      - 🗑️ Removing entity (no remaining balance)`);
//           updatedEntities.splice(j, 1);
//           j--; // Adjust index after removal
//           entityTotals.set(entity.id, rolloverConfig.max);
//           rowNeedsUpdate = true;
//         }
//       } else {
//         entityTotals.set(entity.id, newTotal);
//         console.log(`      - ✅ Total still under maximum, continuing`);
//       }
//     }

//     // Determine what to do with this row
//     if (updatedEntities.length === 0) {
//       console.log(`  - 🗑️ Marking row for deletion (no entities remaining)`);
//       toDelete.push(row.id);
//     } else if (rowNeedsUpdate) {
//       console.log(`  - ✏️ Marking row for update (entities modified)`);
//       toUpdate.push({
//         ...row,
//         entities: updatedEntities,
//       });
//     } else {
//       console.log(`  - ✅ Row unchanged`);
//     }
//   }

//   console.log(
//     `\n📋 Maximum clearing summary for cusEnt ${cusEntID} (entity mode):`
//   );
//   console.log(`  - Rows to update: ${toUpdate.length}`);
//   console.log(`  - Rows to delete: ${toDelete.length}`);
//   console.log(`  - Final entity totals:`);
//   entityTotals.forEach((total, entityId) => {
//     console.log(`    - ${entityId}: ${total}`);
//   });
//   if (toUpdate.length > 0) {
//     console.log(
//       `  - Updated row IDs: ${toUpdate.map((r) => r.id).join(", ")}`
//     );
//   }
//   if (toDelete.length > 0) {
//     console.log(`  - Deleted row IDs: ${toDelete.join(", ")}`);
//   }
// }

// return the rows that were cleared

// for (let i = 0; i < rows.length; i++) {
//   let row = rows[i];
//   // console.log(`\n🔍 Processing row ${i + 1}/${rows.length}:`);
//   // console.log(`  - Row ID: ${row.id}`);
//   // console.log(`  - Row balance: ${row.balance}`);
//   // console.log(`  - Expires at: ${new Date(row.expires_at).toISOString()}`);
//   // console.log(`  - Total before adding this row: ${total}`);

//   total += row.balance;
//   // console.log(`  - Total after adding this row: ${total}`);

//   if (total > rolloverConfig.max) {
//     let diff = total - rolloverConfig.max;
//     // console.log(`  - ⚠️ Total exceeds maximum (${rolloverConfig.max})`);
//     // console.log(`  - Difference to remove: ${diff}`);

//     let newBalance = row.balance - diff;
//     if (newBalance > 0) {
//       // console.log(
//       //   `  - ✏️ Updating row balance from ${row.balance} to ${newBalance}`
//       // );
//       toUpdate.push({
//         ...row,
//         balance: newBalance,
//       });
//     } else {
//       // console.log(`  - 🗑️ Marking row for deletion (no remaining balance)`);
//       toDelete.push(row.id);
//     }
//   } else {
//     // console.log(`  - ✅ Total still under maximum, continuing to next row`);
//     continue;
//   }
// }

// console.log(`\n📋 Maximum clearing summary for cusEnt ${cusEntID}:`);
// console.log(`  - Final total: ${total}`);
// console.log(`  - Rows to update: ${toUpdate.length}`);
// console.log(`  - Rows to delete: ${toDelete.length}`);
// if (toUpdate.length > 0) {
//   console.log(
//     `  - Updated balances: ${toUpdate.map((r) => `${r.id}: ${r.balance}`).join(", ")}`
//   );
// }
// if (toDelete.length > 0) {
//   console.log(`  - Deleted row IDs: ${toDelete.join(", ")}`);
// }
