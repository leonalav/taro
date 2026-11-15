export interface BrowserService { request(input: Record<string, unknown>): Promise<any>; close(): Promise<void> }
export function createReviewBrowser(): BrowserService;
export function browserPageSnapshot(options?: Record<string, unknown>): any;
export function browserQualitySnapshot(options?: Record<string, unknown>): any;
