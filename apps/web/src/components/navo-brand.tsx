import Image from "next/image";

type NavoBrandProps = {
  className?: string;
  label?: string;
  mode?: "mark" | "responsive" | "wordmark";
  priority?: boolean;
  tone?: "navy" | "white";
};

export function NavoBrand({
  className = "",
  label,
  mode = "wordmark",
  priority = false,
  tone = "navy",
}: NavoBrandProps) {
  const classes = ["navo-brand-asset", `navo-brand-${mode}`, className].filter(Boolean).join(" ");

  return (
    <span
      className={classes}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {mode !== "mark" && (
        <Image
          className="navo-wordmark"
          src={tone === "white" ? "/brand/navo-wordmark-white.svg" : "/brand/navo-wordmark-navy.svg"}
          width={384}
          height={94}
          alt=""
          priority={priority}
          unoptimized
        />
      )}
      {mode !== "wordmark" && (
        <Image
          className="navo-app-icon"
          src="/brand/navo-app-icon.svg"
          width={192}
          height={192}
          alt=""
          priority={priority}
          unoptimized
        />
      )}
    </span>
  );
}
