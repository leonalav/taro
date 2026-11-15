process.env.TARO_ADI_ACCEPTANCE = '1';
process.env.TARO_REVIEW_OUTPUT ??= '.verification-adi-review';
await import('./review-ui-check.mjs');
