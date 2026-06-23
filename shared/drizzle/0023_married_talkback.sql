ALTER TABLE "products" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;
