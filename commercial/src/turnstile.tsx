import { useEffect, useRef, useState } from 'react';

type Turnstile = {
  render: (element: HTMLElement, options: {
    sitekey: string; language: string; size: 'flexible'; callback: (token: string) => void;
    'expired-callback': () => void; 'error-callback': () => void; 'timeout-callback': () => void;
  }) => string;
  remove: (widgetId: string) => void;
};

const turnstileWindow = window as Window & { turnstile?: Turnstile };
let loading: Promise<Turnstile> | undefined;

function loadTurnstile() {
  if (turnstileWindow.turnstile) return Promise.resolve(turnstileWindow.turnstile);
  loading ??= new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement('script');
    const failed = () => { script.remove(); reject(new Error('Turnstile unavailable')); };
    const timeout = window.setTimeout(failed, 12_000);
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => {
      window.clearTimeout(timeout);
      if (turnstileWindow.turnstile) resolve(turnstileWindow.turnstile);
      else failed();
    };
    script.onerror = () => { window.clearTimeout(timeout); failed(); };
    document.head.append(script);
  }).catch(error => { loading = undefined; throw error; });
  return loading;
}

export function TurnstileChallenge({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let cleanup: (() => void) | undefined;
    const failed = () => {
      if (!active) return;
      onToken('');
      setError(true);
    };
    void loadTurnstile().then(api => {
      if (!active || !container.current) return;
      const id = api.render(container.current, {
        sitekey: siteKey, language: 'ar', size: 'flexible', callback: token => { if (active) { setError(false); onToken(token); } },
        'expired-callback': () => { if (active) onToken(''); }, 'error-callback': failed, 'timeout-callback': failed,
      });
      cleanup = () => api.remove(id);
    }).catch(failed);
    return () => { active = false; cleanup?.(); };
  }, [siteKey, attempt, onToken]);

  return <div className="auth-challenge">
    <div ref={container} />
    {error && <><p role="status">تعذّر التحقق. جرّب مرة ثانية.</p>
      <button type="button" className="button secondary" onClick={() => { setError(false); setAttempt(value => value + 1); }}>إعادة التحقق</button></>}
  </div>;
}
