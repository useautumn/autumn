import { DrizzleCli } from "@/db/initDrizzle.js";
import {
	RolloverConfig,
	RolloverModel,
	rollovers,
} from "@autumn/shared";
import { and, eq, gte, inArray } from "drizzle-orm";
import { performMaximumClearing } from "./rolloverUtils.js";

export class RolloverService {
	static async update({
		db,
		id,
		updates,
	}: {
		db: DrizzleCli;
		id: string;
		updates: Partial<RolloverModel>;
	}) {
		const data = await db
			.update(rollovers)
			.set(updates as any)
			.where(eq(rollovers.id, id))
			.returning();

		return data;
	}

	static async bulkUpdate({
		db,
		rows,
	}: {
		db: DrizzleCli;
		rows: RolloverModel[];
	}) {
		return await db.transaction(async (tx) => {
			const results = [];
			for (const row of rows) {
				const result = await tx
					.update(rollovers)
					.set(row as any)
					.where(eq(rollovers.id, row.id))
					.returning();
				results.push(...result);
			}
			return results;
		});
	}

	static async insert({
		db,
		rows,
		rolloverConfig,
		cusEntID,
		entityMode,
	}: {
		db: DrizzleCli;
		rows: RolloverModel[];
		rolloverConfig: RolloverConfig;
		cusEntID: string;
		entityMode: boolean;
	}) {
		const data = await db
			.insert(rollovers)
			.values(rows as any)
			.returning();

		console.log("🔍 cusEntID", cusEntID, data[0].cus_ent_id);

		const currentRolloverRows = await db
			.select()
			.from(rollovers)
			.where(
				and(
					eq(rollovers.cus_ent_id, cusEntID),
					gte(rollovers.expires_at, new Date().getTime())
				)
			);

		console.log("🔍 rolloverCusEnt:");
		currentRolloverRows.forEach((rollover, index) => {
			console.log(`  [${index}] ID: ${rollover.id}`);
			console.log(`      Customer Entity ID: ${rollover.cus_ent_id}`);
			console.log(`      Balance: ${rollover.balance}`);
			console.log(
				`      Expires At: ${new Date(rollover.expires_at).toISOString()}`
			);
			if (rollover.entities && Array.isArray(rollover.entities)) {
				console.log(
					`      Entities: ${rollover.entities.length} items`
				);
				rollover.entities.forEach(
					(entity: any, entityIndex: number) => {
						console.log(
							`        [${entityIndex}] ID: ${entity.id}, Balance: ${entity.balance}, Adjustment: ${entity.adjustment}`
						);
					}
				);
			}
			console.log("");
		});

		console.log("🔍 rolloverConfig:");
		console.log(`  Max: ${rolloverConfig?.max}`);
		console.log(`  Length: ${rolloverConfig?.length}`);
		console.log(`  Duration: ${rolloverConfig?.duration}`);

		let { toDelete, toUpdate } = await performMaximumClearing({
			rows: currentRolloverRows as RolloverModel[],
			rolloverConfig,
			cusEntID,
			entityMode,
		});

		if (toDelete.length > 0) {
			await RolloverService.delete({ db, ids: toDelete });
		}

		if (toUpdate.length > 0) {
			await RolloverService.bulkUpdate({ db, rows: toUpdate });
		}

		// Update data in memory to reflect the changes made by performMaximumClearing
		let updatedData = [...data];
		
		// Remove deleted items from the data
		if (toDelete.length > 0) {
			updatedData = updatedData.filter(item => !toDelete.includes(item.id));
		}
		
		// Update modified items in the data
		if (toUpdate.length > 0) {
			updatedData = updatedData.map(item => {
				const updateItem = toUpdate.find(update => update.id === item.id);
				if (updateItem) {
					// Ensure entities have the correct structure with adjustment property
					const updatedEntities = updateItem.entities?.map(entity => ({
						id: entity.id,
						balance: entity.balance,
					})) ?? null;
					
					return { 
						...item, 
						...updateItem,
						entities: updatedEntities
					};
				}
				return item;
			});
		}
		
		return updatedData;
	}

	static async delete({ db, ids }: { db: DrizzleCli; ids: string[] }) {
		const data = await db
			.delete(rollovers)
			.where(inArray(rollovers.id, ids));
	}
}
