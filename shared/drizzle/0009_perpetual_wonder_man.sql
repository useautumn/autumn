ALTER TABLE "oauth_consent" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb;
