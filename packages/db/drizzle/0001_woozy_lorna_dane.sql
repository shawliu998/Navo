CREATE TABLE "conversation_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"revision" integer DEFAULT 1 NOT NULL,
	"conversation_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"summary" text NOT NULL,
	"intent" text,
	"objections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"commitments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_through_message_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"revision" integer DEFAULT 1 NOT NULL,
	"account_id" uuid NOT NULL,
	"contact_id" uuid,
	"subject" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unread_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"revision" integer DEFAULT 1 NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'CONNECTED' NOT NULL,
	"external_workspace_id" text,
	"last_sync_at" timestamp with time zone,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"revision" integer DEFAULT 1 NOT NULL,
	"connection_id" uuid NOT NULL,
	"account_id" uuid,
	"opportunity_mirror_id" uuid,
	"event_type" text NOT NULL,
	"direction" text DEFAULT 'OUTBOUND' NOT NULL,
	"status" text DEFAULT 'SUCCEEDED' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"revision" integer DEFAULT 1 NOT NULL,
	"account_id" uuid NOT NULL,
	"contact_id" uuid,
	"conversation_id" uuid,
	"category" text NOT NULL,
	"fact" text NOT NULL,
	"confidence" numeric(4, 3) NOT NULL,
	"source_message_id" uuid NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_by" uuid
);
--> statement-breakpoint
CREATE TABLE "message_classifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"revision" integer DEFAULT 1 NOT NULL,
	"conversation_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"label" text NOT NULL,
	"confidence" numeric(4, 3) NOT NULL,
	"rationale" text NOT NULL,
	"provider" text DEFAULT 'DETERMINISTIC' NOT NULL,
	"model" text
);
--> statement-breakpoint
CREATE TABLE "next_action_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"revision" integer DEFAULT 1 NOT NULL,
	"account_id" uuid NOT NULL,
	"contact_id" uuid,
	"conversation_id" uuid,
	"source_message_id" uuid,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"rationale" text NOT NULL,
	"priority" text DEFAULT 'MEDIUM' NOT NULL,
	"status" text DEFAULT 'PROPOSED' NOT NULL,
	"due_at" timestamp with time zone,
	"accepted_task_id" uuid
);
--> statement-breakpoint
CREATE TABLE "opportunity_mirrors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"revision" integer DEFAULT 1 NOT NULL,
	"connection_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"stage" text DEFAULT 'PROSPECTING' NOT NULL,
	"amount" numeric(12, 2),
	"currency" text DEFAULT 'USD' NOT NULL,
	"owner_name" text,
	"next_step" text,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"revision" integer DEFAULT 1 NOT NULL,
	"account_id" uuid,
	"contact_id" uuid,
	"conversation_id" uuid,
	"next_action_proposal_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"type" text DEFAULT 'FOLLOW_UP' NOT NULL,
	"priority" text DEFAULT 'MEDIUM' NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"due_at" timestamp with time zone,
	"assignee_name" text,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "in_reply_to_message_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "direction" text DEFAULT 'OUTBOUND' NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "channel" text DEFAULT 'EMAIL' NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "provider_message_id" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "received_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_summary_unique" ON "conversation_summaries" USING btree ("workspace_id","conversation_id");--> statement-breakpoint
CREATE INDEX "conversations_workspace_account_idx" ON "conversations" USING btree ("workspace_id","account_id","last_message_at");--> statement-breakpoint
CREATE INDEX "memory_facts_account_idx" ON "memory_facts" USING btree ("workspace_id","account_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "message_classification_unique" ON "message_classifications" USING btree ("workspace_id","message_id");--> statement-breakpoint
CREATE INDEX "next_action_account_idx" ON "next_action_proposals" USING btree ("workspace_id","account_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "opportunity_mirror_external_unique" ON "opportunity_mirrors" USING btree ("workspace_id","connection_id","external_id");--> statement-breakpoint
CREATE INDEX "tasks_workspace_status_due_idx" ON "tasks" USING btree ("workspace_id","status","due_at");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("workspace_id","conversation_id","created_at");