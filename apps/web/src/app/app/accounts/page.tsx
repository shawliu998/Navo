import Link from "next/link";
import { Import, Plus } from "lucide-react";
import { DEMO_WORKSPACE_ID, getAccountMissionContexts, getAccounts } from "@navo/db/queries";
import { Button, PageHeader } from "@navo/ui";
import { AccountsTable } from "@/components/accounts-table";
export const metadata={title:"Accounts"};
export default async function AccountsPage(){const [accounts,missionContexts]=await Promise.all([getAccounts(DEMO_WORKSPACE_ID),getAccountMissionContexts(DEMO_WORKSPACE_ID)]);const latestByAccount=new Map<string,(typeof missionContexts)[number]>();for(const context of missionContexts){if(!latestByAccount.has(context.accountId))latestByAccount.set(context.accountId,context)}const data=accounts.map(account=>({...account,agentContext:latestByAccount.get(account.id)??null}));return <div className="page page-wide"><PageHeader eyebrow="DISCOVER · AGENT WORKLIST" title="Accounts" description={`${data.length} target accounts ranked by fit, mission context and Navo's recommended next action.`} actions={<><Button variant="secondary" disabled title="Account creation is available through CSV import in this Alpha."><Plus size={15}/>New account</Button><Link href="/app/accounts/import" className="button button-primary"><Import size={15}/>Import CSV</Link></>}/><AccountsTable data={data}/></div>}
