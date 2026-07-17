"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Rocket, Save, ShieldCheck, Sparkles } from "lucide-react";
import { Badge, Button } from "@navo/ui";
import styles from "@/app/app/missions/missions.module.css";
import { hasResearchWebsite } from "@/lib/mission-command";
import type { MissionPreset } from "@/lib/mission-presets";

type PlayOption={id:string;name:string;description:string|null};
type AccountOption={id:string;name:string;website:string|null;domain:string|null;country:string|null;industry:string|null};
type Preview={provider:string;model:string;plannerMode:"AI"|"DETERMINISTIC_FALLBACK";fallbackReason:string|null;plan:{name:string;objective:string;targetDescription:string;steps:Array<{id:string;type:string;title:string;description:string}>;stopConditions:string[];expectedOutputs:string[];assumptions:string[]}};
type FormState={
  name:string;type:string;objective:string;desiredOutcome:string;inputSource:string;targetAccountId:string;
  countries:string;industries:string;playId:string;operatingMode:"AUTONOMOUS"|"OBSERVE"|"RECOMMEND"|"APPROVAL_CONTROLLED";
  approvalPolicy:string;testMode:boolean;maximumAccounts:number;estimatedCostLimit:number;dueAt:string;stopConditions:string;autoContinue:boolean;maximumContinuations:number;
};
const steps=["Goal","Targets","Playbook","Controls","Limits","Review"];
const missionTypes=[
  ["OPPORTUNITY_DISCOVERY","Opportunity discovery","Research, qualify and rank accounts without outreach."],
  ["OUTREACH_PREPARATION","Outreach preparation","Find a viable account and save an evidence-backed English DRAFT."],
] as const;

function buildInitialForm(plays:PlayOption[],accounts:AccountOption[],params:ReturnType<typeof useSearchParams>,preset?:MissionPreset):FormState{
  const requestedAccountId=params.get("accountId");
  const initialAccountId=accounts.find((account)=>account.id===requestedAccountId&&hasResearchWebsite(account.website))?.id??"";
  if(preset){
    return{
      name:preset.name,type:preset.type,objective:preset.objective,desiredOutcome:preset.desiredOutcome,
      inputSource:preset.inputSource,targetAccountId:initialAccountId,countries:preset.countries,
      industries:preset.industries,playId:plays[0]?.id??"",operatingMode:"AUTONOMOUS",approvalPolicy:"DRAFT_ONLY",
      testMode:true,maximumAccounts:preset.maximumAccounts,estimatedCostLimit:1,dueAt:"",stopConditions:preset.stopConditions,autoContinue:true,maximumContinuations:2,
    };
  }
  return{
    name:"",type:"OPPORTUNITY_DISCOVERY",objective:params.get("objective")??"",desiredOutcome:"",inputSource:"DEMO_ACCOUNTS",
    targetAccountId:initialAccountId,countries:"Germany, Austria, Switzerland",industries:"Packaging, Automotive Components",
    playId:plays[0]?.id??"",operatingMode:"AUTONOMOUS",approvalPolicy:"DRAFT_ONLY",testMode:true,maximumAccounts:3,
    estimatedCostLimit:1,dueAt:"",stopConditions:"Best account or explicit no-match outcome is persisted\nMaximum 20 iterations",autoContinue:true,maximumContinuations:2,
  };
}

export function MissionWizard({plays,accounts,preset}:{plays:PlayOption[];accounts:AccountOption[];preset?:MissionPreset}){
  const router=useRouter();const params=useSearchParams();
  const isQuickStart=!!preset;
  const [step,setStep]=useState(isQuickStart?5:0);const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [preview,setPreview]=useState<Preview|null>(null);const [previewing,setPreviewing]=useState(false);
  const [form,setForm]=useState<FormState>(()=>buildInitialForm(plays,accounts,params,preset));
  const set=<K extends keyof FormState>(key:K,value:FormState[K])=>{setForm((current)=>({...current,[key]:value}));setPreview(null);};
  const selectedPlay=plays.find((play)=>play.id===form.playId);
  const selectedAccount=accounts.find((account)=>account.id===form.targetAccountId);
  const criteria=useMemo(()=>({countries:split(form.countries),industries:split(form.industries)}),[form.countries,form.industries]);
  const canContinue=step===0?form.name.trim().length>=3&&form.objective.trim().length>=8:step===4?form.maximumAccounts>0&&form.estimatedCostLimit>=0&&(!form.autoContinue||form.maximumContinuations>0):true;

  async function loadPreview(){
    const objective=form.objective.trim();
    if(objective.length<8)return;
    setPreviewing(true);setPreview(null);setError("");
    try{
      const response=await fetch("/api/agent/commands/preview",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({command:objective,missionType:form.type})});
      const payload=await response.json().catch(()=>null) as {data?:Preview;error?:{message?:string}}|null;
      if(!response.ok||!payload?.data)throw new Error(payload?.error?.message??"AI preview could not be generated.");
      setPreview(payload.data);
    }catch(cause){setError(cause instanceof Error?cause.message:"AI preview could not be generated.")}
    finally{setPreviewing(false)}
  }

  useEffect(()=>{
    if(!isQuickStart)return;
    const timeoutId=window.setTimeout(()=>void loadPreview(),0);
    return()=>window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[isQuickStart]);

  async function submit(status:"DRAFT"|"ACTIVE"){
    setBusy(true);setError("");
    try{
      if(!preview)throw new Error("Wait for the AI mission preview before creating a mission.");
      const response=await fetch("/api/missions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:form.name.trim(),type:form.type,objective:form.objective.trim(),desiredOutcome:form.desiredOutcome.trim()||undefined,status,operatingMode:"AUTONOMOUS",playId:form.playId||undefined,inputSource:form.inputSource,approvalPolicy:form.approvalPolicy,targetAccountId:selectedAccount?.id,targetCount:selectedAccount?1:0,maximumAccounts:form.maximumAccounts,maximumIterations:20,autoContinue:form.autoContinue,maximumContinuations:form.autoContinue?form.maximumContinuations:0,estimatedCostLimit:form.estimatedCostLimit,testMode:form.testMode,dueAt:form.dueAt?new Date(`${form.dueAt}T17:00:00`).toISOString():undefined,targetCriteria:criteria,stopConditions:preview.plan.stopConditions??splitLines(form.stopConditions),plan:preview.plan,provider:preview.provider,model:preview.model,plannerMode:preview.plannerMode,fallbackReason:preview.fallbackReason}),});
      const payload=await response.json().catch(()=>null) as {missionId?:string;error?:{message?:string}}|null;
      if(!response.ok||!payload?.missionId)throw new Error(payload?.error?.message??"Mission could not be created.");
      router.push(`/app/missions/${payload.missionId}`);router.refresh();
    }catch(caught){setError(caught instanceof Error?caught.message:"Mission could not be created.");setBusy(false)}
  }

  return <div className={styles.wizardShell}>
    {isQuickStart&&<div className="quick-start-banner"><Sparkles size={16}/><span><strong>Quick start:</strong> {preset?.name} preset applied. Review the populated objective and constraints, then create the mission.</span></div>}
    <div className={styles.stepper}>{steps.map((label,index)=><div key={label} className={`${styles.step} ${index===step?styles.stepActive:""} ${index<step?styles.stepDone:""}`}><span className={styles.stepCircle}>{index<step?<Check size={14}/>:index+1}</span><span>{label}</span></div>)}</div>
    <div className={styles.wizardGrid}>
      <main className={styles.wizardCard}>
        {step===0&&<><h2>Define the mission goal</h2><p className={styles.wizardIntro}>Give Navo a bounded outcome with enough context to build a controlled plan.</p><div className={styles.field}><label htmlFor="mission-name">Mission name</label><input id="mission-name" value={form.name} onChange={(event)=>set("name",event.target.value)} placeholder="Find high-fit DACH manufacturers" autoFocus/><span className={styles.fieldHint}>A clear, recognizable name for the worklist.</span></div><div className={styles.field}><label htmlFor="mission-objective">Objective</label><textarea id="mission-objective" value={form.objective} onChange={(event)=>set("objective",event.target.value)} placeholder="Identify 20 companies with expansion signals and prepare evidence-backed outreach."/></div><div className={styles.field}><label htmlFor="mission-outcome">Desired outcome</label><input id="mission-outcome" value={form.desiredOutcome} onChange={(event)=>set("desiredOutcome",event.target.value)} placeholder="Five qualified opportunities and approval-ready drafts"/></div><div className={styles.field}><label>Mission type</label><div className={styles.choiceGrid}>{missionTypes.map(([value,title,description])=><label key={value} className={`${styles.choice} ${form.type===value?styles.choiceSelected:""}`}><input type="radio" checked={form.type===value} onChange={()=>set("type",value)}/><strong>{title}</strong><small>{description}</small></label>)}</div></div></>}
        {step===1&&<><h2>Choose the target scope</h2><p className={styles.wizardIntro}>Let Navo select matching seed accounts, or optionally pin one account as an initial candidate. The agent can compare up to three companies.</p><div className={styles.field}><label htmlFor="mission-target-account">Initial account (optional)</label><select id="mission-target-account" value={form.targetAccountId} onChange={(event)=>set("targetAccountId",event.target.value)}><option value="">Let Navo select from seed accounts</option>{accounts.map((account)=><option key={account.id} value={account.id} disabled={!hasResearchWebsite(account.website)}>{account.name}{account.country?` · ${account.country}`:""}{hasResearchWebsite(account.website)?"":" · website required"}</option>)}</select></div>{selectedAccount?<div className="alert alert-info"><ShieldCheck size={16}/><span><strong>{selectedAccount.name}</strong> will be included as an initial candidate.<br/>{[selectedAccount.industry,selectedAccount.country].filter(Boolean).join(" · ")}</span></div>:<div className="alert alert-info">Navo will select candidates from the seeded workspace using the mission objective and criteria.</div>}<div className={styles.field}><label>Countries</label><input value={form.countries} onChange={(event)=>set("countries",event.target.value)} placeholder="Germany, Austria, Switzerland"/></div><div className={styles.field}><label>Industries</label><input value={form.industries} onChange={(event)=>set("industries",event.target.value)} placeholder="Packaging, Automotive Components"/></div></>}
        {step===2&&<><h2>Select a playbook</h2><p className={styles.wizardIntro}>The playbook defines the repeatable execution path. Navo creates a mission-specific plan from it.</p><div className={styles.choiceGrid}>{plays.map((play)=><label key={play.id} className={`${styles.choice} ${form.playId===play.id?styles.choiceSelected:""}`}><input type="radio" checked={form.playId===play.id} onChange={()=>set("playId",play.id)}/><strong>{play.name}</strong><small>{play.description??"A reusable, controlled workflow."}</small></label>)}</div>{!plays.length&&<div className="alert alert-warning">No playbooks are available. Navo will create a standard deterministic plan.</div>}</>}
        {step===3&&<><h2>Autonomous internal execution</h2><p className={styles.wizardIntro}>Navo may research, decide, save a draft, create a task and update memory without pausing. It never sends email.</p><div className={styles.choiceGrid}><label className={`${styles.choice} ${styles.choiceSelected}`}><input type="radio" checked readOnly/><strong>Autonomous</strong><small>Continuous internal execution with bounded registered tools.</small></label></div><div className={styles.field} style={{marginTop:16}}><label>External action policy</label><select value={form.approvalPolicy} onChange={(event)=>set("approvalPolicy",event.target.value)}><option value="DRAFT_ONLY">DRAFT only — no sending</option></select></div><label className={styles.checkRow}><input type="checkbox" checked={form.testMode} onChange={(event)=>set("testMode",event.target.checked)}/>Use deterministic fixtures in Mock mode.</label></>}
        {step===4&&<><h2>Define limits and stop conditions</h2><p className={styles.wizardIntro}>The agent runs continuously within bounded account, iteration and Mission-chain limits.</p><div className={styles.fieldGrid}><div className={styles.field}><label>Maximum accounts</label><input type="number" min={1} max={5} value={form.maximumAccounts} onChange={(event)=>set("maximumAccounts",Number(event.target.value))}/><span className={styles.fieldHint}>Up to five workspace accounts per Mission.</span></div><div className={styles.field}><label>Estimated cost limit (USD)</label><input type="number" min={0} max={10000} step="0.05" value={form.estimatedCostLimit} onChange={(event)=>set("estimatedCostLimit",Number(event.target.value))}/></div></div><label className={styles.checkRow}><input type="checkbox" checked={form.autoContinue} onChange={(event)=>set("autoContinue",event.target.checked)}/>Automatically create the next useful Mission after completion.</label>{form.autoContinue&&<div className={styles.field}><label>Maximum successor Missions</label><input type="number" min={1} max={10} value={form.maximumContinuations} onChange={(event)=>set("maximumContinuations",Number(event.target.value))}/><span className={styles.fieldHint}>The entire chain stops after this many successors. Default: two.</span></div>}<div className={styles.field}><label>Due date</label><input type="date" value={form.dueAt} onChange={(event)=>set("dueAt",event.target.value)}/></div><div className={styles.field}><label>Stop conditions</label><textarea value={form.stopConditions} onChange={(event)=>set("stopConditions",event.target.value)} placeholder="One condition per line"/><span className={styles.fieldHint}>Navo stops after completing the required artifacts or hitting a bound.</span></div></>}
        {step===5&&<><h2>Review and create</h2><p className={styles.wizardIntro}>Review the exact schema-validated autonomous plan that will be persisted and executed.</p>
          <div className={styles.reviewSection}><span>Mission</span><strong>{form.name}</strong></div>
          <div className={styles.reviewSection}><span>Objective</span><strong>{form.objective}</strong></div>
          {form.desiredOutcome&&<div className={styles.reviewSection}><span>Desired outcome</span><strong>{form.desiredOutcome}</strong></div>}
          <div className={styles.reviewSection}><span>Target scope</span><strong>{selectedAccount?.name??"Navo selects matching seed accounts"} · {form.countries}</strong></div>
          <div className={styles.reviewSection}><span>Execution</span><strong>{selectedPlay?.name??"Standard mission plan"} · Autonomous</strong></div>
          <div className={styles.reviewSection}><span>Controls</span><strong>Up to {form.maximumAccounts} accounts · 20 iterations · DRAFT only</strong></div>
          {!preview&&<Button variant="secondary" disabled={previewing} onClick={()=>void loadPreview()}>{previewing?"Generating AI MissionPlan…":"Generate AI MissionPlan preview"}</Button>}
          {preview&&<section className={styles.reviewSection}><span>AI MissionPlan</span><strong>{preview.provider} · {preview.model}</strong><div style={{marginTop:6}}><Badge tone={preview.plannerMode==="AI"?"success":"warning"}>{label(preview.plannerMode)}</Badge></div>{preview.fallbackReason&&<p className="alert alert-warning" style={{margin:"8px 0"}}>Planner fallback: {preview.fallbackReason}</p>}<p className="muted" style={{margin:"6px 0"}}>{preview.plan.targetDescription}</p>{preview.plan.steps.map((item,index)=><div className="list-row" key={item.id}><span><strong>{index+1}. {item.title}</strong><small className="muted" style={{display:"block"}}>{item.description}</small></span><Badge tone="neutral">{label(item.type)}</Badge></div>)}<p className="muted" style={{margin:"9px 0 0"}}>Expected: {preview.plan.expectedOutputs.join(" · ")}</p></section>}
          <div className="alert alert-info" style={{marginTop:16}}><ShieldCheck size={16}/><span>Navo researches, ranks, drafts, creates a task and updates memory. It does not send email.</span></div>
        </>}
        {error&&<div className={styles.error} role="alert">{error}</div>}
        <footer className={styles.wizardFooter}><Button variant="secondary" disabled={step===0||busy} onClick={()=>setStep((value)=>Math.max(0,value-1))}><ArrowLeft size={14}/>Back</Button>{step<5?<Button disabled={!canContinue} onClick={()=>setStep((value)=>Math.min(5,value+1))}>Continue <ArrowRight size={14}/></Button>:<div style={{display:"flex",gap:8}}><Button variant="secondary" disabled={busy||previewing||!preview} onClick={()=>submit("DRAFT")}><Save size={14}/>Save draft</Button><Button disabled={busy||previewing||!preview} onClick={()=>submit("ACTIVE")}><Rocket size={14}/>{busy?"Creating…":previewing?"Preparing plan…":"Create & start"}</Button></div>}</footer>
      </main>
      <aside className={styles.sidebar}><section className={styles.sideCard}><h3>Mission preview</h3><div className={styles.sideList}><div><span>Type</span><strong>{label(form.type)}</strong></div><div><span>Target</span><strong>{selectedAccount?.name??"Choose account"}</strong></div><div><span>Mode</span><strong>{label(form.operatingMode)}</strong></div><div><span>Budget</span><strong>${form.estimatedCostLimit.toFixed(2)}</strong></div><div><span>Delivery</span><Badge tone="success">DRAFT ONLY</Badge></div></div></section><section className={`${styles.sideCard} ${styles.safety}`}><strong>Safety by default</strong><p style={{margin:"7px 0 0"}}>Navo preserves source evidence, researches only the selected website, and never sends email from this flow.</p></section></aside>
    </div>
  </div>;
}
function split(value:string){return value.split(",").map((item)=>item.trim()).filter(Boolean)}
function splitLines(value:string){return value.split("\n").map((item)=>item.trim()).filter(Boolean)}
function label(value:string){return value.replaceAll("_"," ").toLowerCase().replace(/\b\w/g,(letter)=>letter.toUpperCase())}
