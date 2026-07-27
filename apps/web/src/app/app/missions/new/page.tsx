import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DEMO_WORKSPACE_ID, getAccounts, getPlays } from "@navo/db/queries";
import { MissionWizard } from "@/components/mission-wizard";
import { findPreset } from "@/lib/mission-presets";

export const metadata={title:"Create mission"};
export default async function NewMissionPage({searchParams}:{searchParams:Promise<{preset?:string;objective?:string;accountId?:string}>}){
  const [{preset:_presetId},plays,accounts]=await Promise.all([searchParams,getPlays(DEMO_WORKSPACE_ID),getAccounts(DEMO_WORKSPACE_ID)]);
  const preset=findPreset(_presetId);
  return <div className="page"><Link href="/app/missions" className="muted" style={{display:"inline-flex",alignItems:"center",gap:6}}><ArrowLeft size={14}/>Back to missions</Link><MissionWizard plays={plays.map(({id,name,description})=>({id,name,description}))} accounts={accounts.map(({id,name,website,domain,country,industry})=>({id,name,website,domain,country,industry}))} preset={preset}/></div>;
}
