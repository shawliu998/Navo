import { Bot, Braces, CheckCircle2, FlaskConical, ShieldCheck } from "lucide-react";
import { Badge, PageHeader, StatusBadge } from "@exportplay/ui";
const agents=[
  ["Company Research Agent","提取公司产品、市场、地点和公开业务信号","v1.4","mock-research","96%","$0.012"],
  ["ICP Qualification Agent","结合硬规则、加权评分和受约束语义判断","v2.1","deepseek-chat","94%","$0.009"],
  ["Persona Matching Agent","将 Account Context 映射到目标角色","v1.2","deepseek-chat","92%","$0.004"],
  ["Message Personalization Agent","仅使用 Evidence 和 Approved Claims 生成英文草稿","v1.7","deepseek-chat","97%","$0.006"],
  ["Reply Classification Agent","分类回复意图，不生成自主回复","v1.0","deepseek-chat","91%","$0.002"],
];
export default function AgentsPage(){return <div className="page"><PageHeader eyebrow="STRUCTURED AI" title="Agents" description="Agents 是可配置、可验证的结构化研究与判断模块，不是自由聊天机器人。"/><div className="alert alert-info" style={{marginBottom:14}}><ShieldCheck size={16}/><span>DeepSeek Provider 已配置。测试与 Seed 固定使用 MockAI；Schema 失败最多纠正一次，仍失败则 Node Run 标记 FAILED。</span></div><div className="integration-grid">{agents.map(([name,purpose,version,model,success,cost])=><article className="integration-card" key={name}><div className="integration-icon"><Bot size={18}/></div><div className="card-header"><h3>{name}</h3><StatusBadge status="ACTIVE"/></div><p>{purpose}</p><div className="guardrail-item"><small>Version / Model</small><strong>{version} · {model}</strong></div><div className="guardrail-item"><small>Success / Average cost</small><strong>{success} · {cost}</strong></div><div className="toolbar-group" style={{marginTop:12}}><Badge tone="neutral"><Braces size={11}/>Zod schema</Badge><Badge tone="success"><CheckCircle2 size={11}/>Evidence required</Badge></div><button className="button button-secondary" style={{width:"100%",marginTop:14}}><FlaskConical size={14}/>打开测试区</button></article>)}</div></div>}
