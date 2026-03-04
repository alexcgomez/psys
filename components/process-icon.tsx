import { cn } from "@/lib/utils";
import { Server, Terminal, Box } from "lucide-react";
import { Nodejs } from "@/components/ui/svgs/nodejs";
import { NextjsIconDark } from "@/components/ui/svgs/nextjsIconDark";
import { Redis } from "@/components/ui/svgs/redis";
import { MongodbIconLight } from "@/components/ui/svgs/mongodbIconLight";
import { Postgresql } from "@/components/ui/svgs/postgresql";
import { MysqlIconLight } from "@/components/ui/svgs/mysqlIconLight";
import { PsysIcon } from "@/components/psys-icon";

export type ProcessIconType =
  | "psys"
  | "node"
  | "next"
  | "redis"
  | "mongo"
  | "postgres"
  | "mysql"
  | "apache"
  | "ssh"
  | "generic";

const svgIconProps = (size: number, className?: string) => ({
  width: size,
  height: size,
  className: cn("inline-block shrink-0", className),
  "aria-hidden": true as const,
});

export function ProcessIcon({
  type,
  size = 20,
  className,
}: {
  type: ProcessIconType | string | undefined;
  size?: number;
  className?: string;
}) {
  if (!type || type === "generic") {
    return <Box size={size} className={cn("inline-block shrink-0", className)} aria-hidden />;
  }
  switch (type) {
    case "psys":
      return <PsysIcon {...svgIconProps(size, className)} />;
    case "node":
      return <Nodejs {...svgIconProps(size, className)} />;
    case "next":
      return <NextjsIconDark {...svgIconProps(size, className)} />;
    case "redis":
      return <Redis {...svgIconProps(size, className)} />;
    case "mongo":
      return <MongodbIconLight {...svgIconProps(size, className)} />;
    case "postgres":
      return <Postgresql {...svgIconProps(size, className)} />;
    case "mysql":
      return <MysqlIconLight {...svgIconProps(size, className)} />;
    case "apache":
      return <Server size={size} className={cn("inline-block shrink-0", className)} aria-hidden />;
    case "ssh":
      return <Terminal size={size} className={cn("inline-block shrink-0", className)} aria-hidden />;
    default:
      return <Box size={size} className={cn("inline-block shrink-0", className)} aria-hidden />;
  }
}
