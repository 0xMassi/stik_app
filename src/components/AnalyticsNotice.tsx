import { useTranslation } from "@/hooks/useTranslation";

interface AnalyticsNoticeProps {
  onChoice: (enabled: boolean) => void;
}

export default function AnalyticsNotice({ onChoice }: AnalyticsNoticeProps) {
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="analytics-choice-title"
        className="flex w-[380px] flex-col overflow-hidden rounded-[14px] bg-bg shadow-stik"
      >
        <div className="px-5 pt-5">
          <h2
            id="analytics-choice-title"
            className="mb-2.5 text-[14px] font-semibold text-ink"
          >
            {t("analytics.choiceTitle")}
          </h2>
          <p className="text-[12px] leading-relaxed text-stone">
            {t("analytics.choiceExplain")}
          </p>
          <p className="mt-2.5 text-[12px] leading-relaxed text-stone">
            {t("analytics.choiceHint")}
          </p>
        </div>

        <div className="mt-5 flex gap-2 border-t border-line px-5 py-4">
          <button
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
      </div>
    </div>
  );
}
