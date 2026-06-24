import { cn, getInitials, getAvatarColor } from "@/lib/utils";

interface AgentAvatarProps {
  pubkey: string;
  displayName: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeClasses = {
  sm: "w-7 h-7 text-[10px]",
  md: "w-9 h-9 text-xs",
  lg: "w-12 h-12 text-sm",
  xl: "w-16 h-16 text-lg",
};

export function AgentAvatar({ pubkey, displayName, size = "md", className }: AgentAvatarProps) {
  return (
    <div
      className={cn(
        "rounded-xl flex items-center justify-center font-bold text-white",
        "ring-1 ring-white/10 shadow-lg",
        getAvatarColor(pubkey),
        sizeClasses[size],
        className
      )}
    >
      {getInitials(displayName)}
    </div>
  );
}
