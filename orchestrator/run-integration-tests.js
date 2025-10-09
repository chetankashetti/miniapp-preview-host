#!/usr/bin/env node

// Simple test runner for validation integration tests
// Runs real scenarios by calling the /validate endpoint

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🧪 Running Validation Integration Tests...\n');
console.log('This will test real scenarios by calling the /validate endpoint');
console.log('Make sure the server is not already running on port 3002\n');

// Run the integration tests
const testProcess = spawn('node', ['validation-integration-test.js'], {
  cwd: __dirname,
  stdio: 'inherit'
});

testProcess.on('close', (code) => {
  console.log(`\n🏁 Integration tests completed with exit code: ${code}`);
  
  if (code === 0) {
    console.log('✅ All integration tests passed!');
    console.log('\n📊 Test Coverage Summary:');
    console.log('   ✓ Valid TypeScript React components');
    console.log('   ✓ Invalid TypeScript (type errors, missing props, undefined vars)');
    console.log('   ✓ Valid Solidity smart contracts');
    console.log('   ✓ Invalid Solidity (type conversion, syntax errors)');
    console.log('   ✓ Valid Next.js applications');
    console.log('   ✓ Invalid Next.js (missing dependencies)');
    console.log('   ✓ Runtime checks (missing use client, memory leaks)');
    console.log('   ✓ Complete application validation');
  } else {
    console.log('❌ Some integration tests failed.');
    console.log('   Please review the test output above for details.');
  }
  
  process.exit(code);
});

testProcess.on('error', (error) => {
  console.error('❌ Failed to run integration tests:', error.message);
  process.exit(1);
});
