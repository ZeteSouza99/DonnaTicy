CREATE TABLE "operation_requests" (
 "key" TEXT NOT NULL, "actor_id" TEXT NOT NULL, "scope" TEXT NOT NULL,
 "input_hash" TEXT NOT NULL, "response" JSONB NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "operation_requests_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "operation_requests_created_at_idx" ON "operation_requests"("created_at");
CREATE TABLE "import_jobs" (
 "id" TEXT NOT NULL, "user_id" TEXT NOT NULL, "file_name" TEXT NOT NULL, "file_hash" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING', "dry_run" BOOLEAN NOT NULL DEFAULT false,
 "rows" JSONB NOT NULL, "total" INTEGER NOT NULL, "processed" INTEGER NOT NULL DEFAULT 0,
 "summary" JSONB NOT NULL, "parse_errors" JSONB NOT NULL, "error" TEXT,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "import_jobs_user_id_file_hash_dry_run_key" ON "import_jobs"("user_id", "file_hash", "dry_run");
CREATE INDEX "import_jobs_status_created_at_idx" ON "import_jobs"("status", "created_at");
ALTER TABLE "store_credits" ADD COLUMN "return_request_id" TEXT;
CREATE UNIQUE INDEX "store_credits_return_request_id_key" ON "store_credits"("return_request_id");
ALTER TABLE "store_credits" ADD CONSTRAINT "store_credits_return_request_id_fkey" FOREIGN KEY ("return_request_id") REFERENCES "return_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TYPE "notification_channel" ADD VALUE IF NOT EXISTS 'INTERNAL';
ALTER TYPE "automation_execution_status" ADD VALUE IF NOT EXISTS 'COMPLETED';
CREATE TABLE "crm_tasks" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "execution_id" TEXT NOT NULL REFERENCES "automation_executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "customer_id" TEXT NOT NULL REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "title" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'OPEN',
 "completed_at" TIMESTAMP(3),
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "crm_tasks_execution_id_key" ON "crm_tasks"("execution_id");
CREATE INDEX "crm_tasks_status_created_at_idx" ON "crm_tasks"("status", "created_at");
