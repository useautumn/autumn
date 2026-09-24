/**
 * invoices.listTemplates: offset-paginated list of the org's invoice templates,
 * whose ids are what `invoice_template_id` takes.
 */

import { expect, test } from "bun:test";
import type { ListInvoiceTemplatesResponse } from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { InvoiceTemplateService } from "@/internal/orgs/invoiceTemplates/InvoiceTemplateService";
import { generateId } from "@/utils/genUtils";

const createTemplate = ({ name }: { name: string }) =>
	InvoiceTemplateService.create({
		db: ctx.db,
		orgId: ctx.org.id,
		internalId: generateId("inv_tmpl_int"),
		id: generateId("inv_tmpl"),
		values: { name, footer: `Footer for ${name}`, net_terms_days: 30 },
	});

test(`${chalk.yellowBright("invoices.listTemplates: newest first, with offset paging")}`, async () => {
	const customerId = "inv-list-templates";
	const { autumnV2_3 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false })],
		actions: [],
	});

	const older = await createTemplate({ name: "list-templates-older" });
	await Bun.sleep(5);
	const newer = await createTemplate({ name: "list-templates-newer" });

	const all = (await autumnV2_3.post("/invoices.listTemplates", {
		limit: 1000,
	})) as ListInvoiceTemplatesResponse;

	const ids = all.list.map((template) => template.id);
	expect(ids.indexOf(newer.id)).toBeGreaterThanOrEqual(0);
	expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id));
	expect(all.list.find((template) => template.id === newer.id)).toMatchObject({
		name: "list-templates-newer",
		footer: "Footer for list-templates-newer",
		net_terms_days: 30,
	});
	expect(all.total).toBe(all.list.length);

	const firstPage = (await autumnV2_3.post("/invoices.listTemplates", {
		limit: 1,
	})) as ListInvoiceTemplatesResponse;
	expect(firstPage).toMatchObject({
		total: 1,
		limit: 1,
		offset: 0,
		has_more: true,
	});
	expect(firstPage.list[0].id).toBe(ids[0]);

	const secondPage = (await autumnV2_3.post("/invoices.listTemplates", {
		limit: 1,
		offset: 1,
	})) as ListInvoiceTemplatesResponse;
	expect(secondPage.offset).toBe(1);
	expect(secondPage.list[0].id).toBe(ids[1]);

	// Past the end of the list, nothing is returned and nothing follows.
	const emptyPage = (await autumnV2_3.post("/invoices.listTemplates", {
		limit: 1,
		offset: all.list.length,
	})) as ListInvoiceTemplatesResponse;
	expect(emptyPage).toMatchObject({ list: [], total: 0, has_more: false });
});
