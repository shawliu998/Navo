CREATE TABLE "agent_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"revision" integer DEFAULT 1 NOT NULL,
	"mission_id" uuid,
	"account_id" uuid,
	"run_id" uuid,
	"approval_id" uuid,
	"message_id" uuid,
	"task_id" uuid,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"severity" text DEFAULT 'INFO' NOT NULL,
	"status" text DEFAULT 'COMPLETED' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_mission_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"revision" integer DEFAULT 1 NOT NULL,
	"mission_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"run_id" uuid,
	"approval_id" uuid,
	"message_id" uuid,
	"task_id" uuid,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"priority" text DEFAULT 'MEDIUM' NOT NULL,
	"key_signal" text,
	"why_selected" text,
	"current_step" text,
	"suggested_action" text,
	"finding_confidence" numeric(4, 3),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_missions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"revision" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"objective" text NOT NULL,
	"desired_outcome" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"operating_mode" text DEFAULT 'APPROVAL_CONTROLLED' NOT NULL,
	"play_id" uuid,
	"input_source" text DEFAULT 'DEMO_ACCOUNTS' NOT NULL,
	"approval_policy" text DEFAULT 'REQUIRED_FOR_OUTBOUND' NOT NULL,
	"target_count" integer DEFAULT 0 NOT NULL,
	"processed_count" integer DEFAULT 0 NOT NULL,
	"qualified_count" integer DEFAULT 0 NOT NULL,
	"pending_approval_count" integer DEFAULT 0 NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"current_step" text,
	"agent_summary" text,
	"maximum_accounts" integer,
	"estimated_cost_limit" numeric(10, 2),
	"actual_cost" numeric(10, 5) DEFAULT '0' NOT NULL,
	"test_mode" boolean DEFAULT true NOT NULL,
	"stop_conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"target_criteria" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agent_plan_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"revision" integer DEFAULT 1 NOT NULL,
	"mission_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"order" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"related_run_id" uuid,
	"related_play_node_id" text,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"estimated_cost" numeric(10, 5) DEFAULT '0' NOT NULL,
	"error_code" text,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "agent_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"revision" integer DEFAULT 1 NOT NULL,
	"mission_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"estimated_duration_minutes" integer,
	"estimated_cost" numeric(10, 5) DEFAULT '0' NOT NULL,
	"summary" text
);
--> statement-breakpoint
CREATE TABLE "agent_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"revision" integer DEFAULT 1 NOT NULL,
	"profile_id" uuid NOT NULL,
	"operating_mode" text DEFAULT 'APPROVAL_CONTROLLED' NOT NULL,
	"approval_policy" text DEFAULT 'REQUIRED_FOR_OUTBOUND' NOT NULL,
	"daily_schedule" jsonb DEFAULT '{"timezone":"Asia/Shanghai","enabled":true}'::jsonb NOT NULL,
	"test_mode" boolean DEFAULT true NOT NULL,
	"email_sink_enabled" boolean DEFAULT true NOT NULL,
	"max_daily_actions" integer DEFAULT 50 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"revision" integer DEFAULT 1 NOT NULL,
	"name" text DEFAULT 'Navo Growth Agent' NOT NULL,
	"purpose" text NOT NULL,
	"status" text DEFAULT 'IDLE' NOT NULL,
	"operating_mode" text DEFAULT 'APPROVAL_CONTROLLED' NOT NULL,
	"knowledge_health" integer DEFAULT 0 NOT NULL,
	"connected_tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current_activity" text,
	"last_heartbeat_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "agent_events_workspace_occurred_idx" ON "agent_events" USING btree ("workspace_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_mission_target_unique" ON "agent_mission_targets" USING btree ("workspace_id","mission_id","account_id");--> statement-breakpoint
CREATE INDEX "agent_mission_targets_status_idx" ON "agent_mission_targets" USING btree ("workspace_id","mission_id","status");--> statement-breakpoint
CREATE INDEX "agent_missions_workspace_status_idx" ON "agent_missions" USING btree ("workspace_id","status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_plan_step_order_unique" ON "agent_plan_steps" USING btree ("workspace_id","plan_id","order");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_plan_mission_version_unique" ON "agent_plans" USING btree ("workspace_id","mission_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_preferences_workspace_unique" ON "agent_preferences" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_profile_workspace_unique" ON "agent_profiles" USING btree ("workspace_id");