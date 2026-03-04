import { cn } from "@/lib/utils";
import { Docker } from "@/components/ui/svgs/docker";

/** Docker whale logo (SVGL). */
export function DockerIcon({ className, size = 20 }: { className?: string; size?: number }) {
  return (
    <Docker
      width={size}
      height={size}
      className={cn("inline-block shrink-0", className)}
      aria-hidden
    />
  );
}
