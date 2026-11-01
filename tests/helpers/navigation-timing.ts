import type { BrowserContext } from '@playwright/test';

/** Keep real navigation metadata while Playwright's clock mocks performance.
 * Its fake getEntriesByType returns [], which otherwise makes a refresh look
 * like a new visit. Register before installing the clock's context init script.
 */
export async function preserveNavigationTiming(context: BrowserContext) {
  await context.addInitScript(() => {
    const getEntriesByType = performance.getEntriesByType.bind(performance);
    let current = performance;
    Object.defineProperty(window, 'performance', {
      configurable: true,
      get: () => current,
      set: (replacement: Performance) => {
        current = replacement;
        current.getEntriesByType = getEntriesByType;
      },
    });
  });
}
