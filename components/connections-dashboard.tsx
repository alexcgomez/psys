"use client";

import { useCallback, useEffect, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
} from "reactflow";
import "reactflow/dist/style.css";
import type { ConnectionsData } from "@/lib/connections";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DockerIcon } from "@/components/docker-icon";
import { ProcessIcon } from "@/components/process-icon";
import { PsysIcon } from "@/components/psys-icon";
import { RefreshCw, Network, Table as TableIcon, Trash2 } from "lucide-react";

const LISTENER_NODE_WIDTH = 180;
const NODE_HEIGHT = 56;
const GAP = 24;

function ListenerNode({ data }: NodeProps<{ label: string; port: number; pid?: number; processIconType?: string; isDocker?: boolean }>) {
  const typicalIdx = data.label.indexOf("(typical:");
  const unknownIdx = data.label.indexOf("(unknown)");
  const suffixIdx = typicalIdx !== -1 ? typicalIdx : unknownIdx !== -1 ? unknownIdx : -1;
  const labelMain = suffixIdx === -1 ? data.label : data.label.slice(0, suffixIdx).trim();
  const labelSuffix = suffixIdx === -1 ? null : data.label.slice(suffixIdx);
  return (
    <div className="rounded-lg border-2 border-primary/30 bg-card px-3 py-2 shadow-sm">
      <Handle type="source" position={Position.Right} className="!w-2 !h-2" />
      <div className="font-medium text-sm flex items-center gap-1.5 flex-wrap">
        <ProcessIcon type={data.processIconType} size={14} />
        {data.isDocker && <DockerIcon size={12} className="text-[#2496ed]" />}
        {labelMain}
        {labelSuffix && (
          <span className="text-muted-foreground text-[10px] font-normal">{labelSuffix}</span>
        )}
      </div>
      <div className="text-xs text-muted-foreground">port {data.port}</div>
    </div>
  );
}

function TargetNode({ data }: NodeProps<{ label: string; address: string; port: number }>) {
  return (
    <div className="rounded-lg border-2 border-muted bg-muted/50 px-3 py-2 shadow-sm">
      <Handle type="target" position={Position.Left} className="!w-2 !h-2" />
      <div className="font-medium text-sm">{data.label}</div>
      <div className="text-xs text-muted-foreground">{data.address}:{data.port}</div>
    </div>
  );
}

const nodeTypes = { listener: ListenerNode, target: TargetNode };

function buildFlow(data: ConnectionsData): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const targetIds = new Map<string, string>();
  /** First listener id for each pid+port (for edge source) */
  const listenerIdByPidPort = new Map<string, string>();

  data.listeners.forEach((l, i) => {
    const id = `listen-${i}-${l.pid}-${l.port}`;
    const pidPortKey = `${l.pid}-${l.port}`;
    if (!listenerIdByPidPort.has(pidPortKey)) listenerIdByPidPort.set(pidPortKey, id);
    nodes.push({
      id,
      type: "listener",
      position: { x: 40, y: 40 + i * (NODE_HEIGHT + GAP) },
      data: {
        label: l.serviceLabel || l.processName || `:${l.port}`,
        port: l.port,
        pid: l.pid,
        processIconType: l.processIconType,
        isDocker: !!l.containerName,
      },
    });
  });

  let targetIndex = 0;
  const seenEdges = new Set<string>();
  data.connections.forEach((c) => {
    const fromId = listenerIdByPidPort.get(`${c.fromPid}-${c.fromPort}`);
    if (!fromId) return;
    const toKey = `${c.toAddress}:${c.toPort}`;
    let toId = targetIds.get(toKey);
    if (!toId) {
      toId = `target-${toKey.replace(/[.:]/g, "_")}`;
      targetIds.set(toKey, toId);
      const label = c.toLabel || toKey;
      nodes.push({
        id: toId,
        type: "target",
        position: {
          x: 40 + LISTENER_NODE_WIDTH + 120,
          y: 40 + targetIndex * (NODE_HEIGHT + GAP),
        },
        data: {
          label,
          address: c.toAddress,
          port: c.toPort,
        },
      });
      targetIndex++;
    }
    const edgeKey = `${fromId}-${toId}`;
    if (seenEdges.has(edgeKey)) return;
    seenEdges.add(edgeKey);
    edges.push({
      id: `e-${fromId}-${toId}-${edges.length}`,
      source: fromId,
      target: toId,
    });
  });

  return { nodes, edges };
}

export default function ConnectionsDashboard() {
  const [data, setData] = useState<ConnectionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [killingPid, setKillingPid] = useState<number | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/connections");
      if (!res.ok) throw new Error(await res.text());
      const json: ConnectionsData = await res.json();
      setData(json);
      const { nodes: n, edges: e } = buildFlow(json);
      setNodes(n);
      setEdges(e);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [setNodes, setEdges]);

  const killProcess = useCallback(
    async (pid: number) => {
      setKillingPid(pid);
      try {
        const res = await fetch("/api/connections/kill", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pid }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error ?? res.statusText);
        await fetchData();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to kill process");
      } finally {
        setKillingPid(null);
      }
    },
    [fetchData]
  );

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 5000);
    return () => clearInterval(t);
  }, [fetchData]);

  if (error) {
    return (
      <div className="min-h-screen p-6 md:p-8 lg:p-10 max-w-[1800px] mx-auto">
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{error}</p>
            <p className="text-sm text-muted-foreground mt-2">
              Run this app on Linux. Ensure &quot;ss&quot; is available.
            </p>
            <Button variant="outline" className="mt-4" onClick={fetchData}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col box-border">
      <header className="shrink-0 border-b bg-muted/40 px-6 py-4 md:px-8">
        <div className="flex items-center justify-between max-w-[1800px] mx-auto">
          <div className="flex items-center gap-3">
            <PsysIcon className="h-8 w-8 shrink-0 text-primary" />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">psys</h1>
              <p className="text-xs text-muted-foreground">Process System</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </header>
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden p-6 md:p-8 lg:p-10">
        <div className="w-full max-w-[1800px] mx-auto flex-1 flex flex-col min-h-0 min-w-0">
        <Tabs defaultValue="diagram" className="flex-1 flex flex-col min-h-0 w-full min-w-0">
          <TabsList className="grid w-full max-w-[240px] grid-cols-2 shrink-0">
            <TabsTrigger value="diagram" className="gap-2">
              <Network className="h-4 w-4" />
              Diagram
            </TabsTrigger>
            <TabsTrigger value="table" className="gap-2">
              <TableIcon className="h-4 w-4" />
              Table
            </TabsTrigger>
          </TabsList>
          <TabsContent value="diagram" className="flex-1 min-h-0 mt-4 data-[state=inactive]:hidden flex flex-col w-full min-w-0">
            <Card className="h-full min-h-0 flex flex-col overflow-hidden w-full">
              <CardHeader className="py-3 shrink-0">
                <CardTitle className="text-base">Connections</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 min-h-[400px] p-0 w-full">
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  nodeTypes={nodeTypes}
                  fitView
                  fitViewOptions={{ padding: 0.2 }}
                  proOptions={{ hideAttribution: true }}
                  className="bg-muted/20 w-full h-full"
                >
                  <Background />
                  <Controls />
                  <MiniMap />
                </ReactFlow>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="table" className="flex-1 min-h-0 mt-4 data-[state=inactive]:hidden flex flex-col w-full min-w-0">
            <Card className="h-full min-h-0 flex flex-col overflow-hidden w-full">
              <CardHeader className="py-3 shrink-0">
                <CardTitle className="text-base">Listeners (ports exposed)</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-auto p-0 min-h-0 w-full">
                {data?.listeners.length ? (
                  <Table className="w-full">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Process</TableHead>
                        <TableHead>Is Docker Container</TableHead>
                        <TableHead>Port</TableHead>
                        <TableHead>Address</TableHead>
                        <TableHead>Address description</TableHead>
                        <TableHead>Connect to</TableHead>
                        <TableHead>PID</TableHead>
                        <TableHead className="w-[80px] text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...data.listeners]
                        .sort((a, b) => {
                          const hasIcon = (l: (typeof data.listeners)[0]) =>
                            !!l.processIconType && l.processIconType !== "generic";
                          const aIcon = hasIcon(a) ? 1 : 0;
                          const bIcon = hasIcon(b) ? 1 : 0;
                          return bIcon - aIcon;
                        })
                        .map((l, i) => {
                        const conns = data.connections.filter(
                          (c) => c.fromPid === l.pid && c.fromPort === l.port
                        );
                        return (
                          <TableRow key={`${l.address}-${l.port}-${l.pid}-${i}`}>
                            <TableCell className="font-medium">
                              <span className="inline-flex items-center gap-1.5 flex-wrap">
                                <ProcessIcon type={l.processIconType} size={18} />
                                {(() => {
                                  const label = l.serviceLabel ?? l.processName;
                                  const typicalIdx = label.indexOf("(typical:");
                                  const unknownIdx = label.indexOf("(unknown)");
                                  const suffixIdx = typicalIdx !== -1 ? typicalIdx : unknownIdx !== -1 ? unknownIdx : -1;
                                  if (suffixIdx === -1) return label;
                                  return (
                                    <>
                                      {label.slice(0, suffixIdx).trim()}
                                      <span className="text-muted-foreground text-xs font-normal">
                                        {" "}{label.slice(suffixIdx)}
                                      </span>
                                    </>
                                  );
                                })()}
                              </span>
                            </TableCell>
                            <TableCell className="text-center">
                              {l.containerName ? (
                                <DockerIcon size={20} className="text-[#2496ed]" />
                              ) : (
                                <span className="text-muted-foreground text-sm">No</span>
                              )}
                            </TableCell>
                            <TableCell>{l.port}</TableCell>
                            <TableCell>{l.address}</TableCell>
                            <TableCell className="text-muted-foreground max-w-[200px]">
                              {l.addressDescription ?? "—"}
                            </TableCell>
                            <TableCell>
                              {conns.length ? (
                                <div className="flex flex-wrap gap-1">
                                  {conns.slice(0, 5).map((c, j) => (
                                    <Badge key={`${c.toAddress}-${c.toPort}-${j}`} variant="secondary">
                                      {c.toLabel || `${c.toAddress}:${c.toPort}`}
                                    </Badge>
                                  ))}
                                  {conns.length > 5 && (
                                    <Badge variant="outline">+{conns.length - 5}</Badge>
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>{l.pid || "—"}</TableCell>
                            <TableCell className="text-right">
                              {l.pid ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  title="Kill process (SIGTERM)"
                                  disabled={killingPid === l.pid}
                                  onClick={() => killProcess(l.pid!)}
                                >
                                  {killingPid === l.pid ? (
                                    <RefreshCw className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
                                </Button>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="p-6 text-muted-foreground text-sm">
                    No listeners with process info. Run with &quot;ss -tlnp&quot; available.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        </div>
      </div>
    </div>
  );
}
