import { DEMO_WORKSPACE_ID, getConversation, getConversations } from "@navo/db/queries";
import { ReplyInboxWorkspace } from "@/components/reply-inbox-workspace";

export const metadata = { title: "Reply Inbox" };

export default async function ConversationsPage() {
  const items = await getConversations(DEMO_WORKSPACE_ID);
  const selected = items[0]
    ? await getConversation(DEMO_WORKSPACE_ID, items[0].conversation.id)
    : null;

  return <ReplyInboxWorkspace items={items} selected={selected} />;
}
