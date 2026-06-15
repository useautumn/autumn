// One-off: delete all Daytona sandboxes + snapshots in the org to reclaim quota.
import { initInfisical } from "@autumn/shared/utils/infisical";

await initInfisical();
const { daytonaClient } = await import("../../src/providers/daytona/client.js");
const daytona = daytonaClient();

// biome-ignore lint/suspicious/noConsole: cleanup output.
const log = (msg: string) => console.log(msg);

let deleted = 0;
for await (const sb of daytona.list()) {
	log(`sandbox ${sb.id} state=${sb.state} disk=${sb.disk}GiB`);
	try {
		await sb.delete();
		deleted++;
	} catch (error) {
		log(`  delete failed: ${String(error).slice(0, 100)}`);
	}
}

const snaps = await daytona.snapshot.list();
const items = (snaps as { items?: Array<{ name?: string }> }).items ?? [];
for (const snap of items) {
	log(`snapshot ${snap.name}`);
	try {
		await daytona.snapshot.delete(snap as never);
	} catch (error) {
		log(`  snap delete failed: ${String(error).slice(0, 100)}`);
	}
}

log(`\nDeleted ${deleted} sandboxes, ${items.length} snapshots`);
process.exit(0);
