ALTER TABLE "users" ADD COLUMN "username" TEXT;
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
ALTER TABLE "users" ADD CONSTRAINT "users_username_format"
  CHECK ("username" IS NULL OR "username" ~ '^[a-z0-9][a-z0-9._-]{2,39}$');
