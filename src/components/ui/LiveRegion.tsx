interface LiveRegionProps {
  message: string;
  priority?: "polite" | "assertive";
  className?: string;
}

export default function LiveRegion({
  message,
  priority = "polite",
  className = "sr-only",
}: LiveRegionProps) {
  return (
    <div
      role={priority === "assertive" ? "alert" : "status"}
      aria-live={priority}
      aria-atomic="true"
      className={className}
    >
      {message}
    </div>
  );
}
