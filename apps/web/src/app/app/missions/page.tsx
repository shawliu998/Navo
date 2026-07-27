import Link from "next/link";
import { Plus, Target } from "lucide-react";
import { DEMO_WORKSPACE_ID, getMissions } from "@navo/db/queries";
import { PageHeader } from "@navo/ui";
import { MissionList } from "@/components/mission-list";
import { QuickStartCard } from "@/components/quick-start-card";

export const metadata={title:"Missions"};
export default async function MissionsPage({searchParams}:{searchParams:Promise<{status?:string}>}){
  const [missions,{status}]=await Promise.all([getMissions(DEMO_WORKSPACE_ID),searchParams]);
  const items=missions.map((mission)=>({...mission,updatedAt:mission.updatedAt.toISOString(),dueAt:mission.dueAt?.toISOString()??null}));
  const open=missions.filter((mission)=>["ACTIVE","RUNNING","READY","WAITING","PAUSED"].includes(mission.status)).length;
  return <div className="page page-wide"><PageHeader eyebrow="NAVO · AUTONOMOUS WORK" title="Missions" description={`${open} open missions. Track goals, target scope, execution plans, human checkpoints and measurable outcomes in one place.`} actions={<Link href="/app/missions/new" className="button button-primary"><Plus size={15}/>Create mission</Link>}/><div className="alert alert-info" style={{marginBottom:14}}><Target size={16}/><span>Missions keep Navo focused on a bounded outcome. Outbound actions remain approval-controlled.</span></div><QuickStartCard/><MissionList missions={items} current={status}/></div>
}
