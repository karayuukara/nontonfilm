// Ad slots — ganti isinya pake kode iklan dari ad network lo
// Cara setup:
//   1. Daftar di ad network (PropellerAds / Adsterra / Google AdSense)
//   2. Dapetin kode script/html iklannya
//   3. Simpan di Settings → Advanced → Secrets:
//      - VITE_AD_CODE_TOP      = kode banner atas
//      - VITE_AD_CODE_MID      = kode banner tengah
//      - VITE_AD_CODE_BOTTOM   = kode banner bawah
//      - VITE_AD_POPUNDER      = kode popunder
//   4. Rebuild & republish sitenya
//
// Rekomendasi ad network buat situs streaming:
//   • PropellerAds — gampang approve, bagus buat trafik indo
//   • Adsterra — CPM lumayan, nerima situs film
//   • PopAds — khusus popunder, bayaran per view

const adCodes: Record<string, string> = {
  top: (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_AD_CODE_TOP) || "",
  mid: (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_AD_CODE_MID) || "",
  bottom: (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_AD_CODE_BOTTOM) || "",
  popunder: (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_AD_POPUNDER) || "",
};

export function AdBanner({ slot, className = "" }: { slot: "top" | "mid" | "bottom"; className?: string }) {
  const code = adCodes[slot];

  if (!code) {
    return (
      <div className={`w-full flex justify-center ${className}`}>
        <div className="w-full max-w-[728px] h-[90px] border border-dashed border-border/30 rounded-lg flex items-center justify-center text-xs text-muted-foreground/20">
          iklan {slot}
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full flex justify-center overflow-hidden ${className}`}>
      <div dangerouslySetInnerHTML={{ __html: code }} />
    </div>
  );
}

export function PopunderAd() {
  const code = adCodes.popunder;
  if (!code) return null;
  return <div dangerouslySetInnerHTML={{ __html: code }} suppressHydrationWarning />;
}
