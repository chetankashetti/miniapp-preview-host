#!/usr/bin/env node

/**
 * Simple test script for the deployment functionality
 * Tests configuration and basic functionality without external dependencies
 */

const PORT = process.env.TEST_PORT || 8080;
const AUTH_TOKEN = process.env.TEST_AUTH_TOKEN || "test-token";

console.log("🧪 Testing Simplified Deployment Implementation...\n");

// Test environment variables
console.log("📝 Environment Configuration:");
console.log(`PORT: ${process.env.PORT || 8080}`);
console.log(`ENABLE_VERCEL_DEPLOYMENT: ${process.env.ENABLE_VERCEL_DEPLOYMENT || "false"}`);
console.log(`ENABLE_NETLIFY_DEPLOYMENT: ${process.env.ENABLE_NETLIFY_DEPLOYMENT || "false"}`);
console.log(`DEPLOYMENT_TOKEN_SECRET: ${process.env.DEPLOYMENT_TOKEN_SECRET ? "***" : "not set"}`);
console.log(`NETLIFY_TOKEN: ${process.env.NETLIFY_TOKEN ? "***" : "not set"}\n`);

// Validate deployment configuration
function validateConfiguration() {
  console.log("🔧 Validating deployment configuration...");
  
  const issues = [];
  
  // Check required directories
  const fs = require('fs');
  const path = require('path');
  
  const boilerplate = process.env.BOILERPLATE_DIR || "/srv/boilerplate";
  const previews = process.env.PREVIEWS_ROOT || "/srv/previews";
  
  if (!fs.existsSync(boilerplate)) {
    issues.push(`BOILERPLATE_DIR not found: ${boilerplate}`);
  }
  
  // Check auth token
  if (!process.env.PREVIEW_AUTH_TOKEN && !AUTH_TOKEN) {
    issues.push("PREVIEW_AUTH_TOKEN not set");
  }
  
  // Check external deployment configuration
  if (process.env.ENABLE_VERCEL_DEPLOYMENT === "true") {
    if (!process.env.DEPLOYMENT_TOKEN_SECRET) {
      issues.push("VERCEL_DEPLOYMENT enabled but DEPLOYMENT_TOKEN_SECRET not set");
    } else {
      console.log("✅ Vercel deployment configured");
    }
  }
  
  if (process.env.ENABLE_NETLIFY_DEPLOYMENT === "true") {
    if (!process.env.NETLIFY_TOKEN) {
      issues.push("NETLIFY_DEPLOYMENT enabled but NETLIFY_TOKEN not set");
    } else {
      console.log("✅ Netlify deployment configured");
    }
  }
  
  if (issues.length === 0) {
    console.log("✅ Configuration validation passed");
  } else {
    console.log("❌ Configuration issues found:");
    issues.forEach(issue => console.log(`   - ${issue}`));
  }
  
  return issues.length === 0;
}

// Check server syntax
function checkServerSyntax() {
  console.log("🔍 Checking server syntax...");
  
  try {
    const { spawn } = require('child_process');
    const result = spawn('node', ['--check', 'orchestrator/index.js'], { 
      stdio: 'pipe',
      cwd: __dirname 
    });
    
    result.on('exit', (code) => {
      if (code === 0) {
        console.log("✅ Server syntax validation passed");
      } else {
        console.log("❌ Server syntax validation failed");
        process.exit(1);
      }
    });
  } catch (error) {
    console.log(`❌ Syntax check error: ${error.message}`);
  }
}

// Main test function
function main() {
  console.log("🚀 Running deployment implementation tests...\n");
  
  // Check syntax first
  checkServerSyntax();
  
  // Validate configuration
  const configValid = validateConfiguration();
  
  console.log("\n📋 Summary:");
  console.log(`Configuration: ${configValid ? "✅ Valid" : "❌ Invalid"}`);
  console.log(`Port: ${PORT}`);
  console.log(`Auth Token: ${AUTH_TOKEN ? "✅ Set" : "⚠️  Using default"}`);
  
  if (!configValid) {
    console.log("\n💡 To fix configuration issues:");
    console.log("1. Copy environment.example to .env");
    console.log("2. Set PREVIEW_AUTH_TOKEN");
    console.log("3. Create boilerplate directory at BOILERPLATE_DIR");
    console.log("4. Optionally enable deployments and set platform tokens");
  }
  
  console.log("\n🧪 Manual testing commands:");
  console.log("# Local deployment:");
  console.log(`curl -X POST http://localhost:${PORT}/deploy \\`);
  console.log(`  -H "Authorization: Bearer ${AUTH_TOKEN}" \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -d '{"hash":"test","files":{"package.json":"{\\"name\\":\\"test\\"}"}}'`);
  
  console.log("\n# Vercel deployment (if enabled):");
  console.log(`curl -X POST http://localhost:${PORT}/deploy \\`);
  console.log(`  -H "Authorization: Bearer ${AUTH_TOKEN}" \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -d '{"hash":"test","deployToExternal":"vercel","files":{"package.json":"{\\"name\\":\\"test\\"}"}}'`);
  
  console.log("\n# Netlify deployment (if enabled):");
  console.log(`curl -X POST http://localhost:${PORT}/deploy \\`);
  console.log(`  -H "Authorization: Bearer ${AUTH_TOKEN}" \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -d '{"hash":"test","deployToExternal":"netlify","files":{"package.json":"{\\"name\\":\\"test\\"}"}}'`);
}

// Help message
if (process.argv.includes("--help")) {
  console.log(`
Usage: node test-deployment.js

Environment variables:
  TEST_PORT       - Port to test (default: 8080)
  TEST_AUTH_TOKEN - Auth token for testing (default: "test-token")
  
Examples:
  # Test with custom port
  TEST_PORT=9000 node test-deployment.js
  
  # Test with custom auth token
  TEST_AUTH_TOKEN=my-secret-token node test-deployment.js
  
  # Test external deployments (requires tokens)
  ENABLE_VERCEL_DEPLOYMENT=true DEPLOYMENT_TOKEN_SECRET=your-token node test-deployment.js
  `);
  process.exit(0);
}

main();
