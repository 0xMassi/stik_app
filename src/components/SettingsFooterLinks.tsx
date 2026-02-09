import { open } from "@tauri-apps/plugin-shell";
import { SETTINGS_SOCIAL_LINKS } from "@/utils/settingsSocialLinks";

interface SettingsFooterLinksProps {
  appVersion: string;
}

function XIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.369A19.791 19.791 0 0 0 15.885 3c-.191.328-.404.767-.553 1.112a18.27 18.27 0 0 0-5.175 0A11.31 11.31 0 0 0 9.603 3a19.736 19.736 0 0 0-4.433 1.369C2.368 8.554 1.608 12.635 1.988 16.658a19.904 19.904 0 0 0 5.427 2.771 13.264 13.264 0 0 0 1.163-1.872 12.955 12.955 0 0 1-1.831-.883c.154-.113.304-.233.45-.358 3.53 1.662 7.37 1.662 10.858 0 .146.125.297.245.45.358-.586.34-1.2.637-1.834.883.333.65.724 1.274 1.167 1.872a19.89 19.89 0 0 0 5.43-2.771c.446-4.666-.762-8.709-3.951-12.289ZM9.03 14.228c-1.058 0-1.924-.962-1.924-2.144 0-1.182.847-2.144 1.924-2.144 1.078 0 1.943.962 1.924 2.144 0 1.182-.846 2.144-1.924 2.144Zm5.94 0c-1.058 0-1.924-.962-1.924-2.144 0-1.182.846-2.144 1.924-2.144 1.077 0 1.943.962 1.924 2.144 0 1.182-.847 2.144-1.924 2.144Z" />
    </svg>
  );
}

function iconForLink(id: string) {
  if (id === "x") return <XIcon />;
  if (id === "discord") return <DiscordIcon />;
  return null;
}

export default function SettingsFooterLinks({ appVersion }: SettingsFooterLinksProps) {
  const handleOpen = async (href: string) => {
    try {
      await open(href);
    } catch (error) {
      console.error("Failed to open settings link:", error);
    }
  };

  return (
    <div className="flex items-center gap-3 min-w-0">
      {appVersion && <span className="text-[11px] text-stone">v{appVersion}</span>}
      <div className="flex items-center gap-1.5">
        {SETTINGS_SOCIAL_LINKS.map((link) => {
          const icon = iconForLink(link.id);
          const isHelp = link.id === "help";

          return (
            <button
              key={link.id}
              type="button"
              onClick={() => {
                void handleOpen(link.href);
              }}
              className={`inline-flex items-center rounded-md transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-coral/60 ${
                isHelp
                  ? "px-2 py-1 text-[11px] text-stone hover:text-coral hover:bg-line"
                  : "p-1.5 text-stone hover:text-coral hover:bg-line"
              }`}
              title={link.label}
              aria-label={link.ariaLabel}
            >
              {icon ?? <span className="text-[11px]">{link.label}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
