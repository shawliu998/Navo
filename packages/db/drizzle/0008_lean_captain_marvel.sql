ALTER TABLE "contacts" ADD COLUMN "mission_id" uuid;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "source_quote" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "confidence" numeric(4, 3);--> statement-breakpoint
CREATE INDEX "contacts_workspace_mission_idx" ON "contacts" USING btree ("workspace_id","mission_id","account_id");