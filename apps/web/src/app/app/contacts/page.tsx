import { Plus } from "lucide-react";
import { DEMO_WORKSPACE_ID, getContacts } from "@navo/db/queries";
import { Button, PageHeader } from "@navo/ui";
import { ContactsTable, type ContactRow } from "@/components/contacts-table";

export default async function ContactsPage() {
  const items = await getContacts(DEMO_WORKSPACE_ID);
  const rows: ContactRow[] = items.map(({ contact, accountName }) => ({
    id: contact.id,
    accountId: contact.accountId,
    accountName,
    name: contact.name,
    title: contact.title,
    persona: contact.persona,
    email: contact.email,
    emailVerification: contact.emailVerification,
    status: contact.status,
    source: contact.source,
    suppressed: contact.suppressed,
  }));
  return <div className="page page-wide">
    <PageHeader
      eyebrow="GTM DATA"
      title="Contacts"
      description="A unified view of target personas, verification, sources, and suppression."
      actions={<Button disabled title="Contact creation is driven by research and import in this Alpha."><Plus size={15} />Add contact</Button>}
    />
    <ContactsTable rows={rows} />
  </div>;
}
