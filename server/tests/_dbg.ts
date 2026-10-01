import { ApiVersion } from "@autumn/shared";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
const a = new AutumnInt({ version: ApiVersion.V2_3 });
const c: any = await a.customers.get("allocate-gate-1");
console.log(JSON.stringify(c.balances?.messages, null, 1).slice(0, 1500));
const e: any = await a.entities.get("allocate-gate-1", "ent-1");
console.log(JSON.stringify(e.balances?.messages, null, 1).slice(0, 1500));
