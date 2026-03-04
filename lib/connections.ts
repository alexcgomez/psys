import { execSync } from "child_process";
import { readFileSync, existsSync, readlinkSync } from "fs";
import { join, resolve } from "path";

export type Listener = {
  pid: number;
  processName: string;
  /** Label: "6379 (típico: Redis)" or container name when Docker */
  serviceLabel?: string;
  /** Set when this port is published by a Docker container (show Docker icon). */
  containerName?: string;
  /** Icon type for Process column: node, next, redis, mongo, postgres, mysql, apache, ssh, generic */
  processIconType?: string;
  address: string;
  addressDescription?: string;
  port: number;
  cmd?: string;
};

export type Connection = {
  fromPid: number;
  fromProcessName: string;
  fromAddress: string;
  fromPort: number;
  toAddress: string;
  toPort: number;
  toLabel?: string;
};

export type ConnectionsData = {
  listeners: Listener[];
  connections: Connection[];
};

const SS_LISTEN_RE = /LISTEN\s+\d+\s+\d+\s+(\S+)\s+\S+(?:\s+users:\(\("([^"]+)",pid=(\d+),fd=\d+\)\))?/;
const SS_ESTAB_RE = /ESTAB\s+\d+\s+\d+\s+(\S+)\s+(\S+)\s+users:\(\("([^"]+)",pid=(\d+),fd=\d+\)\)/;

function parsePort(addr: string): number {
  const parts = addr.split(":");
  const last = parts[parts.length - 1];
  const port = parseInt(last ?? "0", 10);
  return isNaN(port) ? 0 : port;
}

function normalizeAddress(addr: string): string {
  if (addr === "*" || addr.startsWith("*:")) return "0.0.0.0";
  if (addr.startsWith("[::]")) return "::";
  return addr.replace(/%lo$/, "").replace(/%[a-z0-9]+$/, "");
}

/** Address only (no port), normalized for display: strip port, then %interface. */
function parseAddress(addrPort: string): string {
  const withoutPort = addrPort.replace(/:(\d+)$/, "");
  if (withoutPort === "*" || withoutPort.startsWith("*")) return "0.0.0.0";
  if (withoutPort.startsWith("[::]")) return "::";
  return withoutPort.replace(/%lo$/, "").replace(/%[a-z0-9]+$/, "");
}

/** Consistent key for map lookups: "addr:port" */
function addrPortKey(addrPort: string): string {
  const port = parsePort(addrPort);
  const addr = addrPort.replace(/:(\d+)$/, "");
  return `${addr}:${port}`;
}

/** Human-readable description of what the address means. */
function getAddressDescription(addr: string): string {
  const a = addr.trim();
  if (a === "0.0.0.0") return "Listening on all IPv4 interfaces";
  if (a === "127.0.0.1") return "Localhost only (IPv4)";
  if (a === "[::1]" || a === "::1" || a === "::") return "Localhost or all IPv6";
  if (a === "127.0.0.53") return "systemd-resolved (local DNS)";
  if (a === "127.0.0.54") return "Local DNS (alternative)";
  if (a.startsWith("127.") || a.startsWith("10.") || a.startsWith("192.168.") || a.startsWith("172.")) return "Local network (IPv4)";
  if (a.startsWith("[") && a.includes("]")) return "IPv6 address";
  return "Other interface";
}

function getProcessName(pid: number): string {
  try {
    const commPath = join("/proc", String(pid), "comm");
    if (existsSync(commPath)) {
      return readFileSync(commPath, "utf8").trim();
    }
  } catch {
    // ignore
  }
  return `pid:${pid}`;
}

function getProcessCmd(pid: number): string | undefined {
  try {
    const path = join("/proc", String(pid), "cmdline");
    if (existsSync(path)) {
      const raw = readFileSync(path, "utf8");
      return raw.replace(/\0/g, " ").trim().slice(0, 80);
    }
  } catch {
    // ignore
  }
  return undefined;
}

/** True if this PID is the current app (psys) process. */
function isPsysApp(pid: number): boolean {
  try {
    const cwdPath = join("/proc", String(pid), "cwd");
    if (!existsSync(cwdPath)) return false;
    const cwd = readlinkSync(cwdPath);
    return resolve(cwd) === resolve(process.cwd());
  } catch {
    return false;
  }
}

function getDockerPortLabels(): Map<string, string> {
  const labels = new Map<string, string>();
  try {
    const out = execSync("docker ps --format '{{.Ports}}\t{{.Names}}\t{{.Image}}'", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    for (const line of out.split("\n").filter(Boolean)) {
      const [ports, names] = line.split("\t");
      if (!ports || !names) continue;
      const portMappings = ports.split(", ");
      for (const p of portMappings) {
        const match = p.match(/(?:[\d.]+:)?(\d+)->\d+/);
        const port = match ? match[1] : p.split("/")[0];
        if (port) labels.set(`127.0.0.1:${port}`, names);
        labels.set(`0.0.0.0:${port}`, names);
      }
    }
  } catch {
    // docker not available or not running
  }
  return labels;
}

/** Host port -> container name (for listeners that are Docker-published ports). */
function getDockerPortToContainer(): Map<number, string> {
  const byPort = new Map<number, string>();
  try {
    const out = execSync("docker ps --format '{{.Ports}}\t{{.Names}}'", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    for (const line of out.split("\n").filter(Boolean)) {
      const [ports, names] = line.split("\t");
      if (!ports || !names) continue;
      for (const p of ports.split(", ")) {
        const match = p.match(/(?:[\d.]+:)?(\d+)->\d+/);
        const port = match ? parseInt(match[1], 10) : parseInt(p.split("/")[0], 10);
        if (port && !byPort.has(port)) byPort.set(port, names);
      }
    }
  } catch {
    // ignore
  }
  return byPort;
}

/** Known services by port when process name is "?" (common listeners). */
function knownListenerService(port: number): string | undefined {
  const known: Record<number, string> = {
    22: "SSH",
    53: "DNS (systemd-resolved)",
    80: "Apache / HTTP",
    443: "HTTPS",
    3000: "Node/Express",
    3001: "Node/Express",
    3002: "psys (this app)",
    631: "CUPS (printing)",
    6379: "Redis",
    27017: "MongoDB",
    5432: "PostgreSQL",
    3306: "MySQL",
    5672: "RabbitMQ",
    9200: "Elasticsearch",
  };
  return known[port];
}

/** Port -> icon type for when process is "?". */
const PORT_ICON_TYPE: Record<number, string> = {
  22: "ssh",
  53: "generic",
  80: "apache",
  443: "generic",
  3000: "node",
  3001: "node",
  3002: "next",
  631: "generic",
  6379: "redis",
  27017: "mongo",
  5432: "postgres",
  3306: "mysql",
  5672: "generic",
  9200: "generic",
};

function getProcessIconType(
  processName: string,
  containerName: string | undefined,
  port: number
): string | undefined {
  const name = processName.toLowerCase();
  const container = (containerName ?? "").toLowerCase();
  if (name.includes("node") || name === "mainthread") return "node";
  if (name.includes("next")) return "next";
  if (name.includes("redis")) return "redis";
  if (name.includes("mongo")) return "mongo";
  if (name.includes("postgres") || name.includes("psql")) return "postgres";
  if (name.includes("mysql") || name.includes("mariadb")) return "mysql";
  if (name.includes("apache") || name.includes("httpd")) return "apache";
  if (name.includes("ssh") || name.includes("sshd")) return "ssh";
  if (container.includes("redis")) return "redis";
  if (container.includes("mongo")) return "mongo";
  if (container.includes("postgres")) return "postgres";
  if (container.includes("mysql")) return "mysql";
  return PORT_ICON_TYPE[port] ?? "generic";
}

export function getConnectionsData(): ConnectionsData {
  const dockerLabels = getDockerPortLabels();
  const dockerPortToContainer = getDockerPortToContainer();

  const listeners: Listener[] = [];
  let ssListen: string;
  try {
    ssListen = execSync("ss -tlnp 2>/dev/null", { encoding: "utf8" });
  } catch {
    return { listeners: [], connections: [] };
  }

  for (const line of ssListen.split("\n")) {
    const m = line.match(SS_LISTEN_RE);
    if (!m) continue;
    const [, local, name, pidStr] = m;
    const port = parsePort(local);
    const address = parseAddress(local);
    const pid = pidStr ? parseInt(pidStr, 10) : 0;
    const processName = name || (pid ? getProcessName(pid) : "?");
    const dockerContainer = dockerPortToContainer.get(port);
    const knownService = knownListenerService(port);
    const isOwnApp = pid > 0 && isPsysApp(pid);
    const serviceLabel = isOwnApp
      ? "psys"
      : dockerContainer
        ? dockerContainer
        : processName === "?" && knownService
          ? `${port} (typical: ${knownService})`
          : processName === "?" && !dockerContainer
            ? `${port} (unknown)`
            : undefined;

    listeners.push({
      pid,
      processName,
      serviceLabel: serviceLabel || undefined,
      containerName: dockerContainer,
      processIconType: isOwnApp ? "psys" : getProcessIconType(processName, dockerContainer, port),
      address,
      addressDescription: getAddressDescription(address),
      port,
      cmd: pid ? getProcessCmd(pid) : undefined,
    });
  }

  const connections: Connection[] = [];
  let ssEstab: string;
  try {
    ssEstab = execSync("ss -tnp 2>/dev/null", { encoding: "utf8" });
  } catch {
    return { listeners, connections };
  }

  /** For each local addr:port, which process owns that socket (so we can name "who connected to us") */
  const processAtLocalAddr = new Map<string, string>();
  for (const line of ssEstab.split("\n")) {
    const m = line.match(SS_ESTAB_RE);
    if (!m) continue;
    const [, local, , name, pidStr] = m;
    const pid = parseInt(pidStr ?? "0", 10);
    const processName = name || getProcessName(pid);
    const key = addrPortKey(local);
    if (!processAtLocalAddr.has(key)) processAtLocalAddr.set(key, processName);
  }

  for (const line of ssEstab.split("\n")) {
    const m = line.match(SS_ESTAB_RE);
    if (!m) continue;
    const [, local, peer, name, pidStr] = m;
    const fromPid = parseInt(pidStr ?? "0", 10);
    const fromProcessName = name || getProcessName(fromPid);
    const fromPort = parsePort(local);
    const toAddress = parseAddress(peer);
    const toPort = parsePort(peer);
    const toKey = addrPortKey(peer);
    let toLabel = dockerLabels.get(toKey) || knownPortLabel(toPort);
    if (!toLabel) {
      const peerName = processAtLocalAddr.get(toKey)
        ?? processAtLocalAddr.get(alternateLoopbackKey(toKey));
      if (peerName) toLabel = peerName;
    }

    connections.push({
      fromPid,
      fromProcessName,
      fromAddress: normalizeAddress(local),
      fromPort,
      toAddress,
      toPort,
      toLabel,
    });
  }

  return { listeners, connections };
}

function alternateLoopbackKey(addrPortKey: string): string {
  if (addrPortKey.startsWith("127.0.0.1:")) return addrPortKey.replace("127.0.0.1", "[::1]");
  if (addrPortKey.startsWith("[::1]:") || addrPortKey.startsWith("[::]:")) return addrPortKey.replace(/^\[::\]?1?\]?:/, "127.0.0.1:");
  return "";
}

function knownPortLabel(port: number): string | undefined {
  const known: Record<number, string> = {
    27017: "MongoDB",
    6379: "Redis",
    5432: "PostgreSQL",
    3306: "MySQL",
    9200: "Elasticsearch",
    5672: "RabbitMQ",
  };
  return known[port];
}
