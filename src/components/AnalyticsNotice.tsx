import { useRef } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import Dialog from "./ui/Dialog";

interface AnalyticsNoticeProps {
  onChoice: (enabled: boolean) => void;
}

export default function AnalyticsNotice({ onChoice }: AnalyticsNoticeProps) {
  const { t } = useTranslation();
  const declineRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog
      title={t("analytics.choiceTitle")}
      description={
        <>
          <p className="text-[12px] leading-relaxed text-stone">
            {t("analytics.choiceExplain")}
          </p>
          <p className="mt-2.5 text-[12px] leading-relaxed text-stone">
            {t("analytics.choiceHint")}
          </p>
        </>
      }
      initialFocusRef={declineRef}
      backdropClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
      panelClassName="flex w-[min(92vw,380px)] flex-col overflow-hidden rounded-[14px] bg-bg shadow-stik"
      titleClassName="mb-2.5 px-5 pt-5 text-[14px] font-semibold text-ink"
      descriptionClassName="px-5"
    >
        <div className="mt-5 flex gap-2 border-t border-line px-5 py-4">
          <button
            ref={declineRef}
            type="button"
            onClick={() => onChoice(false)}
            className="flex-1 rounded-full border border-line px-3 py-2.5 text-[13px] font-semibold text-stone hover:bg-line/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral"
          >
            {t("analytics.noThanks")}
          </button>
          <button
            type="button"
            onClick={() => onChoice(true)}
            className="flex-1 rounded-full bg-coral px-3 py-2.5 text-[13px] font-semibold text-white shadow-coral-sm hover:bg-coral-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2"
          >
            {t("analytics.enable")}
          </button>
        </div>
    </Dialog>
  );
}
