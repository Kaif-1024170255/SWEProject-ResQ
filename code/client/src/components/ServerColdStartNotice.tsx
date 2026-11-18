import React, { useState, useEffect } from 'react';

interface ServerColdStartNoticeProps {
  /**
   * Optional custom message. Defaults to:
   * "Connecting to ResQ — this can take a moment if the server has been idle."
   */
  message?: string;
  className?: string;
}

/**
 * Hook that activates after an async operation has been pending for longer than `delayMs`.
 * Ideal for free-tier hosting (Render spins down after inactivity and takes 20-50s to wake up).
 */
export function useColdStartDelay(isPending: boolean, delayMs = 2000): boolean {
  const [show, setShow] = useState<boolean>(false);

  useEffect(() => {
    if (!isPending) {
      setShow(false);
      return;
    }

    const timer = setTimeout(() => {
      setShow(true);
    }, delayMs);

    return () => clearTimeout(timer);
  }, [isPending, delayMs]);

  return show;
}

/**
 * Calm, on-brand loading and cold-start notification styled strictly per DESIGN_SYSTEM.md.
 * Uses Paper Raised background, Slate hairline border, and Signal Amber left accent bar.
 * No generic spinning icons or SaaS gradients.
 */
export const ServerColdStartNotice: React.FC<ServerColdStartNoticeProps> = ({
  message = 'Connecting to ResQ — this can take a moment if the server has been idle.',
  className = '',
}) => {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`bg-paper-raised border border-slate-line border-l-[3px] border-l-amber p-3.5 text-left transition-opacity duration-300 ${className}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          className="inline-block w-2 h-2 rounded-full bg-amber animate-pulse"
          aria-hidden="true"
        />
        <span className="font-mono text-xs uppercase tracking-wider font-semibold text-amber">
          CONNECTING TO BACKEND
        </span>
      </div>
      <p className="text-xs text-slate font-sans leading-relaxed m-0">
        {message}
      </p>
    </div>
  );
};

export default ServerColdStartNotice;
