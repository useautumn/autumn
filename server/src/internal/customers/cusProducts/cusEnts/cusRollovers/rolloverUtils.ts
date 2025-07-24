import {
	FullCustomerEntitlement,
	ProductItemInterval,
	Rollover,
	RolloverModel,
	EntityBalance,
	EntityRolloverBalance,
} from "@autumn/shared";
import { notNullish, nullish } from "@/utils/genUtils.js";
import { randomUUID } from "crypto";

export const getRolloverUpdates = ({
	cusEnt,
	nextResetAt
}: {
	cusEnt: FullCustomerEntitlement;
	nextResetAt: number;
}) => {
	let update: {
		toDelete: string[];
		toInsert: RolloverModel[];
		toUpdate: RolloverModel[];
	} = {
		toDelete: [],
		toInsert: [],
		toUpdate: [],
	};
	if (nullish(cusEnt.entitlement.rollover) || !cusEnt.entitlement.rollover) {
		return update;
	}

	let nextExpiry = calculateNextExpiry(
		nextResetAt,
		cusEnt.entitlement.rollover
	);

	if (nullish(nextExpiry) || !nextExpiry) {
		return update;
	}

	let entitlement = cusEnt.entitlement.allowance ?? 0;

	if (entitlement < 0) {
		return update;
	}

	let rollover = cusEnt.balance || 0;
	console.log(
		`🔥 Unused balance (rollover): ${rollover} | Entitlement: ${entitlement}`
	);

	let newEntitlement = {
		cus_ent_id: cusEnt.id,
		balance: 0,
		expires_at: nextExpiry,
		entities: [] as EntityRolloverBalance[],
		id: randomUUID() as string,
	};

	if (cusEnt.entities != null)
		console.log(
			"🏢 entities:",
			Object.values(cusEnt.entities).map((x: any) => `${x.id}: ${x.balance}`)
		);
	else console.log("🏢 entities: none");
	console.log(
		"📋 entitlement:",
		cusEnt.entitlement.feature_id,
		"| 🆔 entity_feature_id:",
		cusEnt.entitlement.entity_feature_id,
		"| allowance:",
		cusEnt.entitlement.allowance
	);

	if (notNullish(cusEnt.entitlement.entity_feature_id)) {
		console.log("🔍 newEntities:", cusEnt.entities);
		for (const entityId in cusEnt.entities) {
			let entRollover = cusEnt.entities[entityId].balance;
			if (entRollover > 0) {
				newEntitlement.entities.push({
					id: entityId,
					balance: entRollover,
				});
				console.log("🔍 entityId:", entityId, "entRollover:", entRollover);
			} else console.log("🔍 no rollover for entityId:", entityId, " | entitlement:", entitlement, " | balance:", cusEnt.entities[entityId].balance);
		}
		if(newEntitlement.entities.length > 0) update.toInsert.push(newEntitlement);
	} else {
		if (rollover > 0) {
			newEntitlement.balance = rollover;
			if(newEntitlement.balance > 0) update.toInsert.push(newEntitlement);
		} else console.log("🔍 no rollover for entitlement: ", cusEnt.id, " | rollable balance:", rollover);
	}

	console.log(
		"Rollover update sending from rolloverUtils:",
		update.toInsert.map((rollover) => ({
			id: rollover.id,
			balance: rollover.balance,
			entities: rollover.entities.map((entity) => `${entity.id}: ${entity.balance}`).join(", "),
			expires_at: rollover.expires_at ? new Date(rollover.expires_at).toISOString() : null,
		}))
	);

	return update;
};

export const calculateNextExpiry = (nextResetAt: number, config: Rollover) => {
	if (nullish(config)) {
		return null;
	}

	let nextExpiry = new Date(nextResetAt);
	if (config!.duration === ProductItemInterval.Month) {
		nextExpiry.setMonth(nextExpiry.getMonth() + config!.length);
	}

	return nextExpiry.getTime();
};

export async function performMaximumClearing({
	rows,
	rolloverConfig,
	cusEntID,
	entityMode,
}: {
	rows: RolloverModel[];
	rolloverConfig: Rollover;
	cusEntID: string;
	entityMode: boolean;
}) {
	if (!rolloverConfig) {
		throw new Error("Rollover config is required");
	}

	let total = 0;
	let toDelete: string[] = [];
	let toUpdate: RolloverModel[] = [];

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

	if (!entityMode) {
		console.log(`🔄 Starting maximum clearing for cusEnt ${cusEntID} in non-entity mode`);
		console.log(`📊 Initial rows count: ${rows.length}`);
		console.log(`🎯 Maximum rollover allowed: ${rolloverConfig.max}`);
		
		rows.sort((a, b) => a.expires_at - b.expires_at);
		console.log(`📅 Sorted rows by expiry date (oldest first)`);
		
		for (let i = 0; i < rows.length; i++) {
			let row = rows[i];
			console.log(`\n🔍 Processing row ${i + 1}/${rows.length}:`);
			console.log(`  - Row ID: ${row.id}`);
			console.log(`  - Row balance: ${row.balance}`);
			console.log(`  - Expires at: ${new Date(row.expires_at).toISOString()}`);
			console.log(`  - Total before adding this row: ${total}`);
			
			total += row.balance;
			console.log(`  - Total after adding this row: ${total}`);
			
			if (total > rolloverConfig.max) {
				let diff = total - rolloverConfig.max;
				console.log(`  - ⚠️ Total exceeds maximum (${rolloverConfig.max})`);
				console.log(`  - Difference to remove: ${diff}`);
				
				let newBalance = row.balance - diff;
				if (newBalance > 0) {
					console.log(`  - ✏️ Updating row balance from ${row.balance} to ${newBalance}`);
					toUpdate.push({
						...row,
						balance: newBalance,
					});
				} else {
					console.log(`  - 🗑️ Marking row for deletion (no remaining balance)`);
					toDelete.push(row.id);
				}
			} else {
				console.log(`  - ✅ Total still under maximum, continuing to next row`);
				continue;
			}
		}
		
		console.log(`\n📋 Maximum clearing summary for cusEnt ${cusEntID}:`);
		console.log(`  - Final total: ${total}`);
		console.log(`  - Rows to update: ${toUpdate.length}`);
		console.log(`  - Rows to delete: ${toDelete.length}`);
		if (toUpdate.length > 0) {
			console.log(`  - Updated balances: ${toUpdate.map(r => `${r.id}: ${r.balance}`).join(', ')}`);
		}
		if (toDelete.length > 0) {
			console.log(`  - Deleted row IDs: ${toDelete.join(', ')}`);
		}
	} else {
		console.log(`🔄 Starting maximum clearing for cusEnt ${cusEntID} in entity mode`);
		console.log(`📊 Initial rows count: ${rows.length}`);
		console.log(`🎯 Maximum rollover allowed: ${rolloverConfig.max}`);
		
		// Collect all unique entity IDs across all rows
		const allEntityIds = new Set<string>();
		rows.forEach(row => {
			if (row.entities && Array.isArray(row.entities)) {
				row.entities.forEach((entity: any) => {
					if (entity.id) {
						allEntityIds.add(entity.id);
					}
				});
			}
		});
		
		console.log(`🔍 Found ${allEntityIds.size} unique entity IDs: ${Array.from(allEntityIds).join(', ')}`);
		
		// Sort rows by expiry date (oldest first)
		rows.sort((a, b) => a.expires_at - b.expires_at);
		console.log(`📅 Sorted rows by expiry date (oldest first)`);
		
		// Track totals per entity ID
		const entityTotals = new Map<string, number>();
		allEntityIds.forEach(id => entityTotals.set(id, 0));
		
		for (let i = 0; i < rows.length; i++) {
			let row = rows[i];
			console.log(`\n🔍 Processing row ${i + 1}/${rows.length}:`);
			console.log(`  - Row ID: ${row.id}`);
			console.log(`  - Expires at: ${new Date(row.expires_at).toISOString()}`);
			
			if (!row.entities || !Array.isArray(row.entities)) {
				console.log(`  - ⚠️ Row has no entities array, skipping`);
				continue;
			}
			
			let rowNeedsUpdate = false;
			let updatedEntities = [...row.entities];
			
			// Process each entity in this row
			for (let j = 0; j < updatedEntities.length; j++) {
				const entity = updatedEntities[j];
				if (!entity.id || !entity.balance) {
					console.log(`    - ⚠️ Entity missing id or balance, skipping`);
					continue;
				}
				
				const currentTotal = entityTotals.get(entity.id) || 0;
				const newTotal = currentTotal + entity.balance;
				
				console.log(`    - Entity ${entity.id}: balance=${entity.balance}, currentTotal=${currentTotal}, newTotal=${newTotal}`);
				
				if (newTotal > rolloverConfig.max) {
					const excess = newTotal - rolloverConfig.max;
					const newBalance = entity.balance - excess;
					
					console.log(`      - ⚠️ Total exceeds maximum (${rolloverConfig.max})`);
					console.log(`      - Excess to remove: ${excess}`);
					console.log(`      - Updating entity balance from ${entity.balance} to ${newBalance}`);
					
					if (newBalance > 0) {
						updatedEntities[j] = { ...entity, balance: newBalance };
						entityTotals.set(entity.id, rolloverConfig.max);
						rowNeedsUpdate = true;
					} else {
						console.log(`      - 🗑️ Removing entity (no remaining balance)`);
						updatedEntities.splice(j, 1);
						j--; // Adjust index after removal
						entityTotals.set(entity.id, rolloverConfig.max);
						rowNeedsUpdate = true;
					}
				} else {
					entityTotals.set(entity.id, newTotal);
					console.log(`      - ✅ Total still under maximum, continuing`);
				}
			}
			
			// Determine what to do with this row
			if (updatedEntities.length === 0) {
				console.log(`  - 🗑️ Marking row for deletion (no entities remaining)`);
				toDelete.push(row.id);
			} else if (rowNeedsUpdate) {
				console.log(`  - ✏️ Marking row for update (entities modified)`);
				toUpdate.push({
					...row,
					entities: updatedEntities,
				});
			} else {
				console.log(`  - ✅ Row unchanged`);
			}
		}
		
		console.log(`\n📋 Maximum clearing summary for cusEnt ${cusEntID} (entity mode):`);
		console.log(`  - Rows to update: ${toUpdate.length}`);
		console.log(`  - Rows to delete: ${toDelete.length}`);
		console.log(`  - Final entity totals:`);
		entityTotals.forEach((total, entityId) => {
			console.log(`    - ${entityId}: ${total}`);
		});
		if (toUpdate.length > 0) {
			console.log(`  - Updated row IDs: ${toUpdate.map(r => r.id).join(', ')}`);
		}
		if (toDelete.length > 0) {
			console.log(`  - Deleted row IDs: ${toDelete.join(', ')}`);
		}
	}

	// return the rows that were cleared
	return { toDelete, toUpdate };
}