import { open } from "@tauri-apps/plugin-shell";

const PRODUCTHUNT_URL = "https://www.producthunt.com/p/stik-2";

// Feb 24, 2026 12:01 AM PST = Feb 24, 2026 08:01 UTC
const LAUNCH_TIME_UTC = Date.UTC(2026, 1, 24, 8, 1, 0);

export function isProductHuntLive(): boolean {
  return Date.now() >= LAUNCH_TIME_UTC;
}

interface ProductHuntNoticeProps {
  onDismiss: () => void;
}

export default function ProductHuntNotice({ onDismiss }: ProductHuntNoticeProps) {
  const handleOpen = async () => {
    try {
      await open(PRODUCTHUNT_URL);
    } catch (error) {
      console.error("Failed to open Product Hunt link:", error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
      <div className="bg-bg rounded-[14px] w-[380px] shadow-stik flex flex-col overflow-hidden">
        {/* Content */}
        <div className="px-5 pt-5 pb-0">
          <h2 className="text-[14px] font-semibold text-ink mb-2.5">
            We're live on Product Hunt!
          </h2>
          <p className="text-[12px] text-stone leading-relaxed">
            Stik just launched on Product Hunt. If you've been enjoying the app,
            your upvote and feedback would mean the world to us.
          </p>
          <p className="text-[12px] text-stone leading-relaxed mt-2.5">
            Every comment and share helps more people discover Stik. Thank you
            for being part of this journey.
          </p>
        </div>

        <div className="mx-5 my-3.5 border-t border-line" />

        {/* Actions */}
        <div className="px-5 pb-5 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => void handleOpen()}
            className="w-full py-2.5 text-[13px] font-semibold text-white bg-coral rounded-full hover:bg-coral-dark transition-colors shadow-coral-sm"
          >
            Support us on Product Hunt
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="w-full py-2 text-[12px] font-medium text-stone hover:text-ink transition-colors"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
