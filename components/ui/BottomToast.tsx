import type { ToastState } from "@/lib/useTransientToast";

type BottomToastProps = {
  toast: ToastState | null;
};

const toneClasses: Record<NonNullable<ToastState["tone"]>, string> = {
  info: "border-[#b8caea] bg-[#edf2ff] text-[#2d43cc]",
  success: "border-[#94d5b6] bg-[#e8f7f0] text-[#1f8f5f]",
  error: "border-[#f1b7c1] bg-[#ffe8ed] text-[#b6344c]",
};

export default function BottomToast({ toast }: BottomToastProps) {
  if (!toast) return null;

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[120] -translate-x-1/2 px-3">
      <div
        key={toast.id}
        className={`toast-slide-fade max-w-[min(92vw,860px)] rounded-full border px-4 py-2 text-sm shadow-[0_12px_30px_rgba(18,35,52,0.18)] ${toneClasses[toast.tone]}`}
      >
        {toast.message}
      </div>
    </div>
  );
}
