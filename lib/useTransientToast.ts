import { useCallback, useEffect, useRef, useState } from "react";

export type ToastTone = "info" | "success" | "error";

export type ToastState = {
  id: number;
  message: string;
  tone: ToastTone;
};

export function useTransientToast(durationMs = 2800) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, tone: ToastTone = "info") => {
    if (!message.trim()) return;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setToast({
      id: Date.now(),
      message,
      tone,
    });
    timeoutRef.current = setTimeout(() => {
      setToast(null);
      timeoutRef.current = null;
    }, durationMs);
  }, [durationMs]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { toast, showToast };
}
