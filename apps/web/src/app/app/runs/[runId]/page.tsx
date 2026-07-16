import Link from "next/link";
import { ArrowLeft, Ban, RotateCcw } from "lucide-react";
import { notFound } from "next/navigation";
import { DEMO_WORKSPACE_ID, getRun } from "@exportplay/db/queries";
import { Button, StatusBadge } from "@exportplay/ui";
import { RunDetail } from "@/components/run-detail";
export default async function RunPage({params}:{params:Promise<{runId:string}>}){const{runId}=await params;const data=await getRun(DEMO_WORKSPACE_ID,runId);if(!data)notFound();return <div className="page page-wide"><Link href="/app/runs" className="muted" style={{display:"inline-flex",gap:6,alignItems:"center",marginBottom:12}}><ArrowLeft size={14}/>返回 Runs</Link><div className="page-header"><div><div className="eyebrow">RUN #{data.run.runNumber} · VERSION 3</div><h1>{data.playName}</h1><p>{data.accountName} · {data.run.trigger.replaceAll("_"," ")} · Started {new Date(data.run.startedAt).toLocaleString("zh-CN")}</p></div><div className="page-actions"><StatusBadge status={data.run.status}/><Button variant="secondary"><Ban size={14}/>Cancel</Button><Button><RotateCcw size={14}/>Rerun Play</Button></div></div>{data.run.status==="WAITING"&&<div className="alert alert-warning" style={{marginBottom:14}}>Run 正在等待人工审批。批准或拒绝后将从 Human Approval 的对应端口恢复。</div>}<RunDetail runId={runId} nodes={data.nodes}/></div>}
