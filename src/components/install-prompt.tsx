import { useEffect, useRef, useState } from "react";
import type { Copy } from "@/lib/i18n";

const DISMISS_KEY = "fakebtc.install.dismissed";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Offer = "native" | "ios" | "manual";

function isInstalled() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isPhone() {
  return (
    window.matchMedia("(max-width: 820px)").matches ||
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  );
}

export function InstallPrompt({ copy }: { copy: Copy }) {
  const deferred = useRef<InstallEvent | null>(null);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [steps, setSteps] = useState(false);

  useEffect(() => {
    if (isInstalled()) return;
    if (!isPhone()) return;
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      /* private mode */
    }

    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (ios) {
      setOffer("ios");
      return;
    }

    const onPrompt = (event: Event) => {
      event.preventDefault();
      deferred.current = event as InstallEvent;
      setOffer("native");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const reveal = window.setTimeout(() => {
      setOffer((current) => current ?? "manual");
    }, 1200);
    return () => {
      window.clearTimeout(reveal);
      window.removeEventListener("beforeinstallprompt", onPrompt);
    };
  }, []);

  if (!offer) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* private mode */
    }
    setOffer(null);
  };

  const install = () => {
    const event = deferred.current;
    if (!event) {
      setSteps(true);
      return;
    }
    void event.prompt().then(async () => {
      const choice = await event.userChoice;
      deferred.current = null;
      if (choice.outcome === "accepted") setOffer(null);
    });
  };

  const ios = offer === "ios";
  const body = ios ? copy.installIos : steps ? copy.installAndroid : copy.installBody;

  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-bg/80 px-6" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-md border border-line bg-surface p-5 text-center shadow-pop">
        <p className="text-base font-medium text-fg">{copy.installTitle}</p>
        <p className="mt-2 text-sm text-muted">{body}</p>
        <div className="mt-4 grid gap-2">
          {ios || steps ? (
            <button
              type="button"
              onClick={dismiss}
              className="h-11 rounded-md bg-accent text-sm font-medium text-bg"
            >
              {copy.gotIt}
            </button>
          ) : (
            <button
              type="button"
              onClick={install}
              className="h-11 rounded-md bg-accent text-sm font-medium text-bg"
            >
              {copy.install}
            </button>
          )}
          {ios || steps ? null : (
            <button type="button" onClick={dismiss} className="h-11 rounded-md bg-raised text-sm text-muted">
              {copy.later}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
