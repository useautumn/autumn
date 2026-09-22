UPDATE "organizations" AS "organization"
SET "provisioning_source" = 'platform'
WHERE "organization"."created_by" IS NOT NULL
	AND "organization"."is_sandbox" = false
	AND "organization"."provisioning_source" IS NULL
	AND EXISTS (
		SELECT 1
		FROM "api_keys" AS "api_key"
		WHERE "api_key"."org_id" = "organization"."id"
			AND "api_key"."name" = 'Platform API Key'
	);
