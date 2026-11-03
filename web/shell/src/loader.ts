/**
 * Loads one microfrontend bundle and waits until its tag is registered.
 * Resolves false when the script fails or the tag is not defined in time, so the others keep working.
 */
export function loadMicrofrontend(tag: string, src: string, timeout: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeout);
    const script = document.createElement('script');
    script.type = 'module';
    script.src = src;
    script.addEventListener('error', () => finish(false));
    document.head.append(script);
    void customElements.whenDefined(tag).then(() => finish(true));
  });
}
