import { notFound } from "next/navigation";
import { DEMO_WORKSPACE_ID, getConversation, getConversations } from "@navo/db/queries";
import { ReplyInboxWorkspace } from "@/components/reply-inbox-workspace";

export default async function ConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  const [items, selected] = await Promise.all([
    getConversations(DEMO_WORKSPACE_ID),
    getConversation(DEMO_WORKSPACE_ID, conversationId),
  ]);
  if (!selected) notFound();

  return <ReplyInboxWorkspace items={items} selected={selected} />;
}
