// Stryker mutation testing configuration
export default {
  packageManager: 'npm',
  reporters: ['html', 'progress'],
  testRunner: 'jest',
  coverageAnalysis: 'perTest',
  mutate: [
    'src/utils/errors.ts',
    'src/utils/scval.ts',
    'src/utils/network.ts',
  ],
  timeout: 5000,
  thresholds: {
    break: 80,
    high: 85,
  },
};
