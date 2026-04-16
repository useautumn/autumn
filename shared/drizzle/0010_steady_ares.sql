CREATE UNIQUE INDEX "schedules_customer_scope_unique"
	ON "schedules" USING btree ("org_id","env","internal_customer_id")
	WHERE "internal_entity_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "schedules_entity_scope_unique"
	ON "schedules" USING btree ("org_id","env","internal_customer_id","internal_entity_id")
	WHERE "internal_entity_id" IS NOT NULL;
