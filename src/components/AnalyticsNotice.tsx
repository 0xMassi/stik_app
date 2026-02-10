import { open } from "@tauri-apps/plugin-shell";
import { SETTINGS_SOCIAL_LINKS } from "@/utils/settingsSocialLinks";

const GITHUB_URL = "https://github.com/0xMassi/stik_app";

const xLink = SETTINGS_SOCIAL_LINKS.find((l) => l.id === "x")!;
const discordLink = SETTINGS_SOCIAL_LINKS.find((l) => l.id === "discord")!;

interface AnalyticsNoticeProps {
  onDismiss: () => void;
}

export default function AnalyticsNotice({ onDismiss }: AnalyticsNoticeProps) {
  const handleOpen = async (url: string) => {
    try {
      await open(url);
    } catch (error) {
      console.error("Failed to open link:", error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
      <div className="bg-bg rounded-[14px] w-[380px] shadow-stik flex flex-col overflow-hidden">
        {/* Content */}
        <div className="px-5 pt-5 pb-0">
          <h2 className="text-[14px] font-semibold text-ink mb-2.5">What's New</h2>
          <p className="text-[12px] text-stone leading-relaxed">
            We added anonymous analytics to help improve Stik. This only tracks basic usage (app opens, notes created)
            — never your content or personal data.
          </p>
          <p className="text-[12px] text-stone leading-relaxed mt-2.5">
            You can disable this anytime in{" "}
            <span className="text-ink font-medium">Settings &gt; Privacy</span>.
          </p>
        </div>

        <div className="mx-5 my-3.5 border-t border-line" />

        {/* Social links */}
        <div className="px-5">
          <p className="text-[12px] text-stone mb-2.5">If you're enjoying Stik, consider:</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleOpen(GITHUB_URL)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-stone hover:text-coral hover:bg-line rounded-md transition-colors"
            >
              {/* GitHub Invertocat mark */}
              <svg className="w-3.5 h-3.5" viewBox="0 0 98 96" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" clipRule="evenodd" d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z" />
              </svg>
              Star on GitHub
            </button>
            <button
              type="button"
              onClick={() => void handleOpen(xLink.href)}
              className="inline-flex items-center p-1.5 text-stone hover:text-coral hover:bg-line rounded-md transition-colors"
              title={xLink.label}
              aria-label={xLink.ariaLabel}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => void handleOpen(discordLink.href)}
              className="inline-flex items-center p-1.5 text-stone hover:text-coral hover:bg-line rounded-md transition-colors"
              title={discordLink.label}
              aria-label={discordLink.ariaLabel}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M20.317 4.369A19.791 19.791 0 0 0 15.885 3c-.191.328-.404.767-.553 1.112a18.27 18.27 0 0 0-5.175 0A11.31 11.31 0 0 0 9.603 3a19.736 19.736 0 0 0-4.433 1.369C2.368 8.554 1.608 12.635 1.988 16.658a19.904 19.904 0 0 0 5.427 2.771 13.264 13.264 0 0 0 1.163-1.872 12.955 12.955 0 0 1-1.831-.883c.154-.113.304-.233.45-.358 3.53 1.662 7.37 1.662 10.858 0 .146.125.297.245.45.358-.586.34-1.2.637-1.834.883.333.65.724 1.274 1.167 1.872a19.89 19.89 0 0 0 5.43-2.771c.446-4.666-.762-8.709-3.951-12.289ZM9.03 14.228c-1.058 0-1.924-.962-1.924-2.144 0-1.182.847-2.144 1.924-2.144 1.078 0 1.943.962 1.924 2.144 0 1.182-.846 2.144-1.924 2.144Zm5.94 0c-1.058 0-1.924-.962-1.924-2.144 0-1.182.846-2.144 1.924-2.144 1.077 0 1.943.962 1.924 2.144 0 1.182-.847 2.144-1.924 2.144Z" />
              </svg>
            </button>
          </div>
        </div>

        <div className="mx-5 my-3.5 border-t border-line" />

        {/* Dismiss */}
        <div className="px-5 pb-5">
          <button
            type="button"
            onClick={onDismiss}
            className="w-full py-2.5 text-[13px] font-semibold text-white bg-coral rounded-full hover:bg-coral-dark transition-colors shadow-coral-sm"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
