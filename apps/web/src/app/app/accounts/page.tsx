import Link from "next/link";
import { Import, Plus } from "lucide-react";
import { DEMO_WORKSPACE_ID, getAccounts } from "@exportplay/db/queries";
import { Button, PageHeader } from "@exportplay/ui";
import { AccountsTable } from "@/components/accounts-table";
export const metadata={title:"Accounts"};
export default async function AccountsPage(){const data=await getAccounts(DEMO_WORKSPACE_ID);return <div className="page page-wide"><PageHeader eyebrow="GTM DATA" title="Accounts" description={`${data.length} 个目标账户 · 支持搜索、筛选、批量运行、CSV 导入和证据化研究。`} actions={<><Button variant="secondary"><Plus size={15}/>新建账户</Button><Link href="/app/accounts/import" className="button button-primary"><Import size={15}/>导入 CSV</Link></>}/><AccountsTable data={data}/></div>}
