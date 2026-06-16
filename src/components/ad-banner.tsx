export function AdBanner({ slot, className = "" }: { slot: "top" | "mid" | "bottom"; className?: string }) {
  const adCode = (() => {
    // Pull ad codes from env vars or use placeholder
    switch (slot) {
      case "top":
        return process.env.AD_CODE_TOP || null;
      case "mid":
        return process.env.AD_CODE_MID || null;
      case "bottom":
        return process.env.AD_CODE_BOTTOM || null;
    }
  })();

  return (
    <div className={`w-full ${className}`}>
      {adCode ? (
        <div
          className="ad-slot flex justify-center overflow-hidden"
          dangerouslySetInnerHTML={{ __html: adCode }}
        />
      ) : (
        <AdPlaceholder slot={slot} />
      )}
    </div>
  );
}

function AdPlaceholder({ slot }: { slot: string }) {
  return (
    <div className="w-full border-2 border-dashed border-border rounded-lg bg-muted/30 flex flex-col items-center justify-center py-8 text-center">
      <div className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-1">
        Ad Slot: {slot}
      </div>
      <div className="text-xs text-muted-foreground/50">
        Set AD_CODE_{slot.toUpperCase()} env var
      </div>
    </div>
  );
}

export function PopunderScript() {
  const popunderCode = process.env.AD_POPUNDER_CODE || null;
  if (!popunderCode) return null;

  return (
    <div
      dangerouslySetInnerHTML={{ __html: popunderCode }}
      suppressHydrationWarning
    />
  );
}
