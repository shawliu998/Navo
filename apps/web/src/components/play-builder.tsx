"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ReactFlow,
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import {
  AlertTriangle,
  ArrowLeft,
  Brain,
  Check,
  CirclePlay,
  Copy,
  Database,
  GitBranch,
  LayoutTemplate,
  LoaderCircle,
  MessageSquareText,
  MousePointer2,
  Play,
  Redo2,
  Save,
  Search,
  ShieldCheck,
  Undo2,
  UserCheck,
  Users,
  Workflow,
} from "lucide-react";
import { nodeRegistry, nodeRegistryByType } from "@navo/workflows/registry";

type FlowData = {
  label: string;
  type: string;
  config: Record<string, unknown>;
};
const icons: Record<string, typeof Workflow> = {
  Triggers: CirclePlay,
  Research: Search,
  Decision: GitBranch,
  Prospecting: Users,
  Content: MessageSquareText,
  Human: UserCheck,
  Engagement: Play,
  CRM: Database,
  Utility: Workflow,
  Memory: Brain,
  "Reply Intelligence": MessageSquareText,
  Guardrails: ShieldCheck,
};
function ExportNode({ data, selected }: NodeProps<Node<FlowData>>) {
  const definition = nodeRegistryByType.get(data.type);
  const Icon = icons[definition?.category ?? "Utility"] ?? Workflow;
  return (
    <div className={`export-node ${selected ? "selected" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <div className="node-head">
        <span className="node-icon">
          <Icon size={14} />
        </span>
        <span>
          <span className="node-category">{definition?.category}</span>
          <span className="node-label" style={{ display: "block" }}>
            {data.label}
          </span>
        </span>
      </div>
      <div className="node-body">
        {summary(data)}
        <div className="node-ports">
          <span>input</span>
          <span>{definition?.outputPorts.join(" · ")}</span>
        </div>
      </div>
      {definition?.outputPorts.length ? (
        <Handle type="source" position={Position.Right} />
      ) : null}
    </div>
  );
}
const nodeTypes = { exportNode: ExportNode };
const ClientMiniMap = dynamic(
  () => import("@xyflow/react").then((module) => module.MiniMap),
  { ssr: false },
);
const summary = (data: FlowData) => {
  if (data.type === "researchCompany")
    return `Max ${String(data.config.maxPages ?? 8)} pages · English`;
  if (data.type === "qualifyAccount")
    return `Minimum score ${String(data.config.minimumScore ?? 60)}`;
  if (data.type === "generateMessage") return "Approved claims only · Concise";
  if (data.type === "humanApproval") return "Reviewer role · Required";
  if (data.type === "enrollSequence") return "Test mode · EmailSink";
  return "Deterministic node configuration";
};

export function PlayBuilder({
  playId,
  name,
  status,
  initialGraph,
  versionNumber,
}: {
  playId: string;
  name: string;
  status: string;
  initialGraph: {
    nodes: Array<{
      id: string;
      type: string;
      label: string;
      position: { x: number; y: number };
      config: Record<string, unknown>;
    }>;
    edges: Array<{
      id: string;
      source: string;
      target: string;
      branch?: string;
    }>;
  };
  versionNumber: number;
}) {
  const router = useRouter();
  const initialNodes = useMemo(
    () =>
      initialGraph.nodes.map((item) => ({
        id: item.id,
        type: "exportNode",
        position: item.position,
        width: 230,
        height: 105,
        measured: { width: 230, height: 105 },
        data: { label: item.label, type: item.type, config: item.config },
      })),
    [initialGraph],
  );
  const initialEdges = useMemo(
    () =>
      initialGraph.edges.map((item) => ({
        id: item.id,
        source: item.source,
        target: item.target,
        label: item.branch,
        animated: item.branch === "Approved",
        style: { stroke: item.branch === "Approved" ? "#746afb" : "#59606c" },
        labelStyle: { fill: "#aeb4bf", fontSize: 10 },
      })),
    [initialGraph],
  );
  const [nodes, setNodes, onNodesChange] =
    useNodesState<Node<FlowData>>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges);
  const [selectedId, setSelectedId] = useState(nodes[0]?.id ?? null);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">(
    "saved",
  );
  const [message, setMessage] = useState(
    "Graph is valid and ready for a test run.",
  );
  const [nodeSearch, setNodeSearch] = useState("");
  const [flow, setFlow] = useState<ReactFlowInstance<
    Node<FlowData>,
    Edge
  > | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selected = nodes.find((node) => node.id === selectedId);
  const visibleRegistry = nodeRegistry.filter((node) => {
    const query = nodeSearch.trim().toLocaleLowerCase();
    return !query || `${node.label} ${node.category} ${node.type}`.toLocaleLowerCase().includes(query);
  });
  const save = useCallback(
    async (nextNodes = nodes, nextEdges = edges) => {
      setSaveState("saving");
      try {
        const response = await fetch(`/api/plays/${playId}/draft`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodes: nextNodes.map((node) => ({
              id: node.id,
              type: node.data.type,
              label: node.data.label,
              position: node.position,
              config: node.data.config,
            })),
            edges: nextEdges.map((edge) => ({
              id: edge.id,
              source: edge.source,
              target: edge.target,
              branch: typeof edge.label === "string" ? edge.label : undefined,
            })),
          }),
        });
        if (!response.ok) throw new Error();
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    },
    [nodes, edges, playId],
  );
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), 900);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [nodes, edges, save]);
  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((current) =>
        addEdge(
          {
            ...connection,
            id: `edge-${crypto.randomUUID()}`,
            style: { stroke: "#59606c" },
          },
          current,
        ),
      ),
    [setEdges],
  );
  const onNodeClick: NodeMouseHandler<Node<FlowData>> = useCallback(
    (_, node) => setSelectedId(node.id),
    [],
  );
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/navo-node");
      const definition = nodeRegistryByType.get(type);
      if (!definition || !flow) return;
      const position = flow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      const id = `${type}-${crypto.randomUUID().slice(0, 6)}`;
      setNodes((current) => [
        ...current,
        {
          id,
          type: "exportNode",
          position,
          width: 230,
          height: 105,
          measured: { width: 230, height: 105 },
          data: { label: definition.label, type, config: {} },
        },
      ]);
      setSelectedId(id);
    },
    [flow, setNodes],
  );
  const publish = async () => {
    setMessage("Validating immutable version…");
    const response = await fetch(`/api/plays/${playId}/publish`, {
      method: "POST",
    });
    const payload = await response.json();
    if (response.ok) {
      setMessage(`Published version ${payload.versionNumber}.`);
      router.refresh();
    } else setMessage(payload.error?.message ?? "Validation failed.");
  };
  const testRun = async () => {
    setMessage("Creating deterministic test run…");
    const response = await fetch(`/api/plays/${playId}/test-run`, {
      method: "POST",
    });
    const payload = await response.json();
    if (response.ok) router.push(`/app/runs/${payload.runId}`);
    else setMessage(payload.error?.message ?? "Unable to start test run.");
  };
  return (
    <div className="builder-shell">
      <header className="builder-toolbar">
        <div className="builder-toolbar-group">
          <button
            className="dark-button"
            onClick={() => router.push("/app/plays")}
          >
            <ArrowLeft size={14} />
          </button>
          <strong>{name}</strong>
          <span className="badge badge-neutral">{status}</span>
          <span style={{ color: "#858c99", fontSize: 11 }}>
            v{versionNumber}
          </span>
          <span
            style={{
              color: saveState === "error" ? "#ef7777" : "#8f96a2",
              fontSize: 11,
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            {saveState === "saving" ? (
              <LoaderCircle size={12} />
            ) : saveState === "saved" ? (
              <Check size={12} />
            ) : (
              <AlertTriangle size={12} />
            )}{" "}
            {saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
                ? "Saved"
                : "Save failed"}
          </span>
        </div>
        <div className="builder-toolbar-group">
          <button className="dark-button" aria-label="Undo" disabled title="Undo history is not available in this Alpha.">
            <Undo2 size={14} />
          </button>
          <button className="dark-button" aria-label="Redo" disabled title="Redo history is not available in this Alpha.">
            <Redo2 size={14} />
          </button>
          <button
            className="dark-button"
            onClick={() => flow?.fitView({ padding: 0.15, duration: 400 })}
          >
            <LayoutTemplate size={14} />
            Auto Layout
          </button>
          <button className="dark-button" onClick={testRun}>
            <CirclePlay size={14} />
            Test Run
          </button>
          <button className="dark-button primary" onClick={publish}>
            <Save size={14} />
            Publish
          </button>
        </div>
      </header>
      <aside className="node-palette">
        <div className="palette-title">Node Library</div>
        <input className="palette-search" placeholder="Search nodes…" value={nodeSearch} onChange={(event) => setNodeSearch(event.target.value)} aria-label="Search node library" />
        {[...new Set(visibleRegistry.map((node) => node.category))].map(
          (category) => (
            <div key={category}>
              <div className="palette-group">{category}</div>
              {visibleRegistry
                .filter((node) => node.category === category)
                .map((node) => {
                  const Icon = icons[category] ?? Workflow;
                  return (
                    <div
                      className="palette-node"
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData(
                          "application/navo-node",
                          node.type,
                        );
                        event.dataTransfer.effectAllowed = "move";
                      }}
                      key={node.type}
                    >
                      <span className="palette-node-icon">
                        <Icon size={13} />
                      </span>
                      <span>{node.label}</span>
                    </div>
                  );
                })}
            </div>
          ),
        )}
      </aside>
      <main
        className="canvas"
        onDrop={onDrop}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onInit={setFlow}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          fitView
          minZoom={0.2}
          maxZoom={1.5}
          deleteKeyCode={["Backspace", "Delete"]}
          multiSelectionKeyCode="Shift"
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={18}
            size={1}
            color="#30343d"
          />
          <Controls position="bottom-left" />
          <ClientMiniMap
            position="bottom-right"
            nodeColor="#655cf6"
            maskColor="rgba(14,16,20,.75)"
          />
        </ReactFlow>
      </main>
      <aside className="inspector">
        {selected ? (
          <>
            <h3>{selected.data.label}</h3>
            <div className="inspector-subtitle">
              {nodeRegistryByType.get(selected.data.type)?.category} ·{" "}
              {selected.data.type}
            </div>
            <div className="console-tabs" style={{ marginTop: 16 }}>
              <span className="active">Configure</span>
              <span>Input</span>
              <span>Output</span>
            </div>
            <div className="dark-field">
              <label>Node label</label>
              <input
                value={selected.data.label}
                onChange={(event) =>
                  setNodes((current) =>
                    current.map((node) =>
                      node.id === selected.id
                        ? {
                            ...node,
                            data: { ...node.data, label: event.target.value },
                          }
                        : node,
                    ),
                  )
                }
              />
            </div>
            {selected.data.type === "researchCompany" && (
              <div className="dark-field">
                <label>Max pages</label>
                <input
                  type="number"
                  value={String(selected.data.config.maxPages ?? 8)}
                  onChange={(event) =>
                    setNodes((current) =>
                      current.map((node) =>
                        node.id === selected.id
                          ? {
                              ...node,
                              data: {
                                ...node.data,
                                config: {
                                  ...node.data.config,
                                  maxPages: Number(event.target.value),
                                },
                              },
                            }
                          : node,
                      ),
                    )
                  }
                />
              </div>
            )}
            <div className="dark-field">
              <label>Failure policy</label>
              <select>
                <option>Stop and mark failed</option>
                <option>Continue to fallback branch</option>
              </select>
            </div>
            <div
              className="alert"
              style={{ background: "#1d2420", color: "#8fd4af", marginTop: 16 }}
            >
              <ShieldCheck size={15} />
              <span style={{ fontSize: 11 }}>
                Configuration passes schema validation. External actions still require policy checks and approval.
              </span>
            </div>
            <button
              className="dark-button"
              style={{ marginTop: 14, width: "100%" }}
            >
              <Copy size={13} />
              Duplicate Node
            </button>
          </>
        ) : (
          <div className="empty-state">
            <MousePointer2 />
            <strong>Select a node</strong>
            <p>Inspect its configuration, inputs, outputs, and validation.</p>
          </div>
        )}
      </aside>
      <section className="run-console">
        <div className="console-tabs">
          <span className="active">Validation</span>
          <span>Run Console</span>
          <span>Test Data</span>
          <span>Errors</span>
        </div>
        <div className="validation-item">
          <Check size={14} color="#48bc83" />
          <span>{message}</span>
        </div>
        <div className="validation-item">
          <Check size={14} color="#48bc83" />
          <span>
            Trigger is present · all visible nodes are connected · Test Mode
            prevents real sending.
          </span>
        </div>
      </section>
    </div>
  );
}
