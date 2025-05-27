import { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnMetadata, metadata } from "@autumn/shared";
import { eq } from "drizzle-orm";

export class MetadataService {
  static async insert({ db, data }: { db: DrizzleCli; data: AutumnMetadata }) {
    await db.insert(metadata).values(data);
  }

  static async get({ db, id }: { db: DrizzleCli; id: string }) {
    const data = await db
      .select()
      .from(metadata)
      .where(eq(metadata.id, id))
      .limit(1);

    if (data.length === 0) {
      return null;
    }

    return data[0] as AutumnMetadata;
  }
}
