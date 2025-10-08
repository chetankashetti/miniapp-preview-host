// validation.js - Railway compilation validation module

import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Railway Compilation Validator
 * Provides full compilation validation using Railway's complete environment
 */
export class RailwayCompilationValidator {
  constructor(projectRoot, boilerplateDir, previewsRoot) {
    this.projectRoot = projectRoot;
    this.boilerplateDir = boilerplateDir;
    this.previewsRoot = previewsRoot;
  }

  /**
   * Main validation method - orchestrates all validation steps
   */
  async validateProject(projectId, filesArray, validationConfig, runCommand) {
    const startTime = Date.now();
    console.log(`[${projectId}] 🔧 Starting full compilation validation...`);
    
    // Create temporary directory for validation
    const tempDir = path.join(this.previewsRoot, `${projectId}-validation-${Date.now()}`);
    
    try {
      // 1. Create temp project structure
      await this.createTempProjectForValidation(tempDir, filesArray);
      console.log(`[${projectId}] 📁 Created temporary project structure`);
      
      // 2. Run validations in parallel
      const validationPromises = [];
      
      if (validationConfig.enableTypeScript) {
        validationPromises.push(this.validateTypeScript(projectId, tempDir, runCommand));
      }
      
      if (validationConfig.enableSolidity) {
        validationPromises.push(this.validateSolidity(projectId, tempDir, runCommand));
      }
      
      if (validationConfig.enableESLint) {
        validationPromises.push(this.validateESLint(projectId, tempDir, runCommand));
      }
      
      if (validationConfig.enableBuild) {
        validationPromises.push(this.validateBuild(projectId, tempDir, runCommand));
      }
      
      if (validationConfig.enableRuntimeChecks) {
        validationPromises.push(this.validateRuntimeChecks(projectId, filesArray));
      }
      
      // 3. Wait for all validations to complete
      console.log(`[${projectId}] 🔍 Running ${validationPromises.length} validation checks...`);
      const results = await Promise.all(validationPromises);
      
      // 4. Combine results
      const allErrors = [];
      const allWarnings = [];
      const allInfo = [];
      
      for (const result of results) {
        allErrors.push(...(result.errors || []));
        allWarnings.push(...(result.warnings || []));
        allInfo.push(...(result.info || []));
      }
      
      const hasErrors = allErrors.length > 0;
      const compilationTime = Date.now() - startTime;
      
      // 5. Generate validation summary
      const validationSummary = this.generateValidationSummary(filesArray, allErrors, allWarnings);
      
      console.log(`[${projectId}] 📊 Validation completed in ${compilationTime}ms`);
      console.log(`[${projectId}]   ✅ Success: ${!hasErrors}`);
      console.log(`[${projectId}]   ❌ Errors: ${allErrors.length}`);
      console.log(`[${projectId}]   ⚠️  Warnings: ${allWarnings.length}`);
      console.log(`[${projectId}]   ℹ️  Info: ${allInfo.length}`);
      
      return {
        success: !hasErrors,
        errors: allErrors,
        warnings: allWarnings,
        info: allInfo,
        files: filesArray.map(f => ({ filename: f.path, content: f.content })),
        compilationTime,
        validationSummary
      };
      
    } finally {
      // 6. Cleanup temp directory
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
        console.log(`[${projectId}] 🧹 Cleaned up temporary directory`);
      } catch (cleanupError) {
        console.warn(`[${projectId}] ⚠️ Failed to cleanup temp directory:`, cleanupError.message);
      }
    }
  }

  /**
   * Create temporary project structure for validation
   */
  async createTempProjectForValidation(tempDir, filesArray) {
    // Create temp directory
    await fs.mkdir(tempDir, { recursive: true });
    
    // Copy essential config files from boilerplate
    const configFiles = [
      'package.json',
      'tsconfig.json',
      'next.config.ts',
      'next.config.js',
      'tailwind.config.js',
      'tailwind.config.ts',
      'eslint.config.mjs',
      'eslint.config.js',
      '.eslintrc.json',
      '.eslintrc.js',
      'hardhat.config.js',
      'hardhat.config.ts'
    ];
    
    for (const configFile of configFiles) {
      const sourcePath = path.join(this.boilerplateDir, configFile);
      if (existsSync(sourcePath)) {
        const destPath = path.join(tempDir, configFile);
        const destDir = path.dirname(destPath);
        
        if (!existsSync(destDir)) {
          await fs.mkdir(destDir, { recursive: true });
        }
        
        await fs.copyFile(sourcePath, destPath);
      }
    }
    
    // Write all files to temp directory
    for (const file of filesArray) {
      const filePath = path.join(tempDir, file.path);
      const dir = path.dirname(filePath);
      
      if (!existsSync(dir)) {
        await fs.mkdir(dir, { recursive: true });
      }
      
      await fs.writeFile(filePath, file.content, 'utf8');
    }
  }

  /**
   * TypeScript compilation validation using globally available TypeScript
   */
  async validateTypeScript(projectId, tempDir, runCommand) {
    try {
      console.log(`[${projectId}] 🔍 Validating TypeScript compilation...`);
      
      // Use globally available TypeScript from Railway service's node_modules
      const globalTscPath = path.join(process.cwd(), 'node_modules', '.bin', 'tsc');
      let command = "npx";
      let args = ["tsc", "--noEmit", "--skipLibCheck"];
      
      if (existsSync(globalTscPath)) {
        command = globalTscPath;
        args = ["--noEmit", "--skipLibCheck"];
        console.log(`[${projectId}] 🚀 Using globally available TypeScript compiler`);
      } else {
        console.log(`[${projectId}] 📦 Using npx to run TypeScript compiler`);
      }
      
      const output = await runCommand(command, args, { 
        id: projectId, 
        cwd: tempDir 
      });
      
      return { errors: [], warnings: [] };
    } catch (error) {
      console.log(`[${projectId}] ⚠️ TypeScript validation found errors`);
      return this.parseTypeScriptErrors(error.message || error.toString());
    }
  }

  /**
   * Solidity compilation validation
   */
  async validateSolidity(projectId, tempDir, runCommand) {
    try {
      const contractsDir = path.join(tempDir, 'contracts');
      if (!existsSync(contractsDir)) {
        console.log(`[${projectId}] 📁 No contracts directory found, skipping Solidity validation`);
        return { errors: [], warnings: [] };
      }
      
      console.log(`[${projectId}] 🔍 Validating Solidity compilation...`);
      
      const output = await runCommand("npx", ["hardhat", "compile", "--force"], { 
        id: projectId, 
        cwd: tempDir 
      });
      
      return { errors: [], warnings: [] };
    } catch (error) {
      console.log(`[${projectId}] ⚠️ Solidity validation found errors`);
      return this.parseSolidityErrors(error.message || error.toString());
    }
  }

  /**
   * ESLint validation using globally available ESLint
   */
  async validateESLint(projectId, tempDir, runCommand) {
    try {
      console.log(`[${projectId}] 🔍 Validating ESLint...`);
      
      // Use globally available ESLint from Railway service's node_modules
      const globalEslintPath = path.join(process.cwd(), 'node_modules', '.bin', 'eslint');
      let command = "npx";
      let args = ["eslint", "src", "--format", "json", "--max-warnings", "0"];
      
      if (existsSync(globalEslintPath)) {
        command = globalEslintPath;
        args = ["src", "--format", "json", "--max-warnings", "0"];
        console.log(`[${projectId}] 🚀 Using globally available ESLint`);
      } else {
        console.log(`[${projectId}] 📦 Using npx to run ESLint`);
      }
      
      const output = await runCommand(command, args, { 
        id: projectId, 
        cwd: tempDir 
      });
      
      return { errors: [], warnings: [] };
    } catch (error) {
      console.log(`[${projectId}] ⚠️ ESLint validation found errors`);
      return this.parseESLintErrors(error.message || error.toString());
    }
  }

  /**
   * Next.js build validation using globally available Next.js
   */
  async validateBuild(projectId, tempDir, runCommand) {
    try {
      console.log(`[${projectId}] 🔍 Validating Next.js build...`);
      
      // Use globally available Next.js from Railway service's node_modules
      const globalNextPath = path.join(process.cwd(), 'node_modules', '.bin', 'next');
      let command = "npx";
      let args = ["next", "build", "--no-lint"];
      
      if (existsSync(globalNextPath)) {
        command = globalNextPath;
        args = ["build", "--no-lint"];
        console.log(`[${projectId}] 🚀 Using globally available Next.js`);
      } else {
        console.log(`[${projectId}] 📦 Using npx to run Next.js`);
      }
      
      const output = await runCommand(command, args, { 
        id: projectId, 
        cwd: tempDir 
      });
      
      return { errors: [], warnings: [] };
    } catch (error) {
      console.log(`[${projectId}] ⚠️ Build validation found errors`);
      return this.parseBuildErrors(error.message || error.toString());
    }
  }

  /**
   * Runtime checks validation
   */
  async validateRuntimeChecks(projectId, filesArray) {
    console.log(`[${projectId}] 🔍 Running runtime checks...`);
    
    const errors = [];
    const warnings = [];
    const info = [];
    
    // Check for common runtime issues
    for (const file of filesArray) {
      if (file.path.endsWith('.tsx') || file.path.endsWith('.ts')) {
        const runtimeIssues = this.checkRuntimeIssues(file.content, file.path);
        errors.push(...runtimeIssues.errors);
        warnings.push(...runtimeIssues.warnings);
        info.push(...runtimeIssues.info);
      }
    }
    
    return { errors, warnings, info };
  }

  /**
   * Check for runtime issues in code
   */
  checkRuntimeIssues(content, filename) {
    const errors = [];
    const warnings = [];
    const info = [];
    
    // Check for missing 'use client' directive in React components
    if ((filename.endsWith('.tsx') || filename.endsWith('.jsx')) && 
        (content.includes('useState') || content.includes('useEffect') || content.includes('onClick')) &&
        !content.startsWith("'use client';") && !content.startsWith('"use client";')) {
      errors.push({
        file: filename,
        line: 1,
        message: "Missing 'use client' directive for React component with hooks",
        severity: 'error',
        category: 'react',
        suggestion: "Add 'use client'; at the top of the file"
      });
    }
    
    // Check for unescaped entities in JSX
    const unescapedQuotes = content.match(/['"`]([^'"`]*['"`][^'"`]*['"`][^'"`]*)['"`]/g);
    if (unescapedQuotes && filename.endsWith('.tsx')) {
      warnings.push({
        file: filename,
        line: 1,
        message: "Potential unescaped quotes in JSX string",
        severity: 'warning',
        category: 'react',
        suggestion: "Use &apos; for apostrophes and &quot; for quotes in JSX"
      });
    }
    
    return { errors, warnings, info };
  }

  /**
   * Parse TypeScript compilation errors
   */
  parseTypeScriptErrors(errorOutput) {
    const errors = [];
    const lines = errorOutput.split('\n');
    
    for (const line of lines) {
      if (line.includes('error TS')) {
        const match = line.match(/(.+?)\((\d+),(\d+)\): error TS\d+: (.+)/);
        if (match) {
          errors.push({
            file: match[1].trim(),
            line: parseInt(match[2]),
            column: parseInt(match[3]),
            message: match[4].trim(),
            severity: 'error',
            category: 'typescript'
          });
        }
      }
    }
    
    return { errors, warnings: [] };
  }

  /**
   * Parse Solidity compilation errors
   */
  parseSolidityErrors(errorOutput) {
    const errors = [];
    const lines = errorOutput.split('\n');
    
    for (const line of lines) {
      if (line.includes('Error:')) {
        errors.push({
          file: 'solidity',
          line: 1,
          message: line.replace('Error:', '').trim(),
          severity: 'error',
          category: 'solidity'
        });
      }
    }
    
    return { errors, warnings: [] };
  }

  /**
   * Parse ESLint errors
   */
  parseESLintErrors(errorOutput) {
    const errors = [];
    
    try {
      const eslintResults = JSON.parse(errorOutput);
      for (const result of eslintResults) {
        for (const message of result.messages) {
          errors.push({
            file: result.filePath,
            line: message.line,
            column: message.column,
            message: message.message,
            severity: message.severity === 2 ? 'error' : 'warning',
            category: 'eslint',
            rule: message.ruleId
          });
        }
      }
    } catch (parseError) {
      // Fallback to simple parsing
      const lines = errorOutput.split('\n');
      for (const line of lines) {
        if (line.includes('error') || line.includes('warning')) {
          errors.push({
            file: 'eslint',
            line: 1,
            message: line.trim(),
            severity: line.includes('error') ? 'error' : 'warning',
            category: 'eslint'
          });
        }
      }
    }
    
    return { errors, warnings: [] };
  }

  /**
   * Parse build errors
   */
  parseBuildErrors(errorOutput) {
    const errors = [];
    const lines = errorOutput.split('\n');
    
    for (const line of lines) {
      if (line.includes('Error:') || line.includes('Failed to compile')) {
        errors.push({
          file: 'build',
          line: 1,
          message: line.trim(),
          severity: 'error',
          category: 'build'
        });
      }
    }
    
    return { errors, warnings: [] };
  }

  /**
   * Generate validation summary
   */
  generateValidationSummary(filesArray, errors, warnings) {
    const filesWithErrors = new Set(errors.map(e => e.file));
    const filesWithWarnings = new Set(warnings.map(w => w.file));
    
    return {
      totalFiles: filesArray.length,
      filesWithErrors: filesWithErrors.size,
      filesWithWarnings: filesWithWarnings.size,
      criticalErrors: errors.filter(e => e.severity === 'error').length
    };
  }
}
