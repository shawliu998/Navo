"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@navo/ui";
import styles from "@/app/app/missions/missions.module.css";

export function MissionActions({missionId,status}:{missionId:string;status:string}){
  const router=useRouter();const [busy,setBusy]=useState<string>();const [error,setError]=useState("");
  async function act(action:"start"|"pause"|"resume"|"cancel"){
    if(action==="cancel"&&!window.confirm("Cancel this mission? Its history will be preserved, but it cannot be resumed."))return;
    setBusy(action);setError("");
    try{const response=await fetch(`/api/missions/${missionId}/${action}`,{method:"POST"});const payload=await response.json().catch(()=>null) as {error?:{message?:string}}|null;if(!response.ok)throw new Error(payload?.error?.message??`Could not ${action} mission.`);router.refresh()}catch(caught){setError(caught instanceof Error?caught.message:`Could not ${action} mission.`)}finally{setBusy(undefined)}
  }
  const terminal=["COMPLETED","CANCELLED"].includes(status);
  return <div style={{display:"grid",justifyItems:"end",gap:5}}><div className="page-actions">
    {["DRAFT","PLANNING","READY"].includes(status)&&<Button disabled={!!busy} onClick={()=>act("start")}><Play size={14}/>{busy==="start"?"Starting…":"Start mission"}</Button>}
    {["ACTIVE","WAITING","PLANNING"].includes(status)&&<Button variant="secondary" disabled={!!busy} onClick={()=>act("pause")}><Pause size={14}/>{busy==="pause"?"Pausing…":"Pause"}</Button>}
    {status==="PAUSED"&&<Button disabled={!!busy} onClick={()=>act("resume")}><RotateCcw size={14}/>{busy==="resume"?"Resuming…":"Resume"}</Button>}
    {!terminal&&<Button variant="ghost" disabled={!!busy} onClick={()=>act("cancel")}><Ban size={14}/>Cancel</Button>}
  </div>{error&&<span className={styles.actionError}>{error}</span>}</div>
}
