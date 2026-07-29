CREATE INDEX CONCURRENTLY "idx_rewards_org_id_env" ON "rewards" USING btree ("org_id","env");
