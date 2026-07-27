ALTER TABLE "memory_facts" ALTER COLUMN "source_message_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_missions" ADD COLUMN "planner_mode" text DEFAULT 'AI' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_missions" ADD COLUMN "planner_fallback_reason" text;--> statement-breakpoint
ALTER TABLE "memory_facts" ADD COLUMN "source_type" text DEFAULT 'MESSAGE' NOT NULL;--> statement-breakpoint
ALTER TABLE "memory_facts" ADD COLUMN "source_id" uuid;--> statement-breakpoint
ALTER TABLE "memory_facts" ADD COLUMN "evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "memory_facts"
SET "source_type" = CASE WHEN "mission_id" IS NOT NULL THEN 'MISSION' ELSE 'MESSAGE' END,
    "source_id" = COALESCE("mission_id", "source_message_id"),
    "source_message_id" = CASE WHEN "mission_id" IS NOT NULL THEN NULL ELSE "source_message_id" END;
