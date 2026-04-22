// PWA helpers: service worker lifecycle + install-prompt plumbing.
// Kept strict and defensive — older Safari lacks both APIs.

type InstallChoice = 'accepted' | 'dismissed';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: ReadonlyArray<string>;
  readonly userChoice: Promise<{ outcome: InstallChoice; platform: string }>;
  prompt: () => Promise<void>;
}

function isSecureish(): boolean {
  // window.isSecureContext is true on https + localhost.
  return typeof window !== 'undefined' && window.isSecureContext === true;
}

function isDev(): boolean {
  // Read Vite's import.meta.env without depending on vite/client ambient types,
  // so this file typechecks in projects that haven't added a vite-env.d.ts yet.
  const meta = import.meta as unknown as { env?: { DEV?: boolean; MODE?: string } };
  if (meta.env?.DEV === true) return true;
  if (meta.env?.MODE === 'development') return true;
  return false;
}

export function registerServiceWorker(): void {
  if (isDev()) {
    console.info('[pwa] skipping service worker registration in dev');
    return;
  }
  if (!isSecureish()) {
    console.info('[pwa] skipping service worker: not a secure context');
    return;
  }
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    console.info('[pwa] service workers unsupported in this browser');
    return;
  }

  navigator.serviceWorker
    .register('/sw.js', { scope: '/' })
    .then((reg) => {
      console.info('[pwa] service worker registered', reg.scope);
    })
    .catch((err: unknown) => {
      console.warn('[pwa] service worker registration failed', err);
    });
}

export async function unregisterServiceWorkers(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
    console.info('[pwa] unregistered', regs.length, 'service worker(s)');
  } catch (err: unknown) {
    console.warn('[pwa] failed to unregister service workers', err);
  }
}

export function onInstallPromptAvailable(
  cb: (prompt: () => Promise<InstallChoice>) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  const handler = (event: Event): void => {
    // Older Safari never fires this; guard anyway.
    const bip = event as BeforeInstallPromptEvent;
    if (typeof bip.prompt !== 'function') return;
    event.preventDefault();

    const trigger = async (): Promise<InstallChoice> => {
      try {
        await bip.prompt();
        const { outcome } = await bip.userChoice;
        return outcome;
      } catch (err: unknown) {
        console.warn('[pwa] install prompt failed', err);
        return 'dismissed';
      }
    };

    cb(trigger);
  };

  window.addEventListener('beforeinstallprompt', handler);
  return () => window.removeEventListener('beforeinstallprompt', handler);
}
