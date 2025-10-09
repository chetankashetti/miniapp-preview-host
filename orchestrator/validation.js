// validation.js - Railway compilation validation module

import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import * as ts from "typescript";

/**
 * TypeScript Compiler Service
 * Uses TypeScript Compiler API for structured diagnostics and validation
 */
class TypeScriptCompilerService {
  constructor() {
    this.compilerOptions = {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      allowSyntheticDefaultImports: true,
      esModuleInterop: true,
      allowJs: true,
      skipLibCheck: true,
      strict: true,
      forceConsistentCasingInFileNames: true,
      noEmit: true,
      jsx: ts.JsxEmit.ReactJSX,
      resolveJsonModule: true,
      isolatedModules: true,
      incremental: true,
      baseUrl: ".", // ✅ Ensure baseUrl is set for path mapping
      plugins: [
        { name: "next" }
      ],
      paths: {
        "@/*": ["./src/*"],
        "@/components/*": ["./src/components/*"],
        "@/lib/*": ["./src/lib/*"],
        "@/app/*": ["./src/app/*"]
      }
    };
  }

  /**
   * Validate TypeScript files using Compiler API
   */
  async validateTypeScriptFiles(projectId, tempDir) {
    try {
      console.log(`[${projectId}] 🔍 Validating TypeScript using Compiler API...`);
      
      // Load tsconfig.json if it exists
      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      let compilerOptions = { ...this.compilerOptions };
      
      if (existsSync(tsconfigPath)) {
        try {
          const tsconfigContent = await fs.readFile(tsconfigPath, 'utf8');
          const configFile = ts.parseJsonConfigFileContent(
            JSON.parse(tsconfigContent),
            ts.sys,
            path.dirname(tsconfigPath)
          );
          compilerOptions = {
            ...this.compilerOptions,
            ...configFile.options,
            baseUrl: configFile.options.baseUrl || ".", // ✅ Ensure baseUrl is always set
            paths: {
              ...this.compilerOptions.paths,
              ...configFile.options.paths
            }
          };
        } catch (error) {
          console.warn(`[${projectId}] ⚠️ Failed to parse tsconfig.json, using defaults:`, error.message);
        }
      }

      // Create program with all TypeScript files
      const files = await this.findTypeScriptFiles(tempDir);
      const program = ts.createProgram(files, compilerOptions);
      
      // Get diagnostics
      const diagnostics = [
        ...program.getSemanticDiagnostics(),
        ...program.getSyntacticDiagnostics(),
        ...program.getDeclarationDiagnostics(),
        ...program.getConfigFileParsingDiagnostics()
      ];

      // Convert diagnostics to structured format
      const errors = [];
      const warnings = [];
      
      for (const diagnostic of diagnostics) {
        const result = this.formatDiagnostic(diagnostic, tempDir);
        if (result) {
          if (diagnostic.category === ts.DiagnosticCategory.Error) {
            errors.push(result);
          } else if (diagnostic.category === ts.DiagnosticCategory.Warning) {
            warnings.push(result);
          }
        }
      }

      return { errors, warnings };
      
    } catch (error) {
      console.error(`[${projectId}] ❌ TypeScript Compiler API error:`, error.message);
      return {
        errors: [{
          file: 'typescript-compiler',
          line: 1,
          column: 1,
          message: `TypeScript Compiler API error: ${error.message}`,
          severity: 'error',
          category: 'typescript-compiler'
        }],
        warnings: []
      };
    }
  }

  /**
   * Find all TypeScript files in the project
   */
  async findTypeScriptFiles(rootDir) {
    const files = [];
    const extensions = ['.ts', '.tsx', '.js', '.jsx'];
    
    const scanDir = async (dir) => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory()) {
            // Skip node_modules and other common directories
            if (!['node_modules', '.next', 'dist', 'build'].includes(entry.name)) {
              await scanDir(fullPath);
            }
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name);
            if (extensions.includes(ext)) {
              files.push(fullPath);
            }
          }
        }
      } catch (error) {
        // Skip directories that can't be read
        console.warn(`Skipping directory ${dir}:`, error.message);
      }
    };
    
    await scanDir(rootDir);
    return files;
  }

  /**
   * Format TypeScript diagnostic to structured format
   */
  formatDiagnostic(diagnostic, projectRoot) {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    
    if (diagnostic.file) {
      const filePath = diagnostic.file.fileName;
      const relativePath = path.relative(projectRoot, filePath);
      
      const start = diagnostic.start;
      let line = 1;
      let column = 1;
      
      if (start !== undefined) {
        const sourceFile = diagnostic.file;
        const pos = sourceFile.getLineAndCharacterOfPosition(start);
        line = pos.line + 1;
        column = pos.character + 1;
      }
      
      return {
        file: relativePath,
        line: line,
        column: column,
        message: message,
        severity: diagnostic.category === ts.DiagnosticCategory.Error ? 'error' : 'warning',
        category: 'typescript',
        code: diagnostic.code,
        source: 'typescript-compiler-api'
      };
    } else {
      // Global diagnostic (e.g., config file issues)
      return {
        file: 'tsconfig.json',
        line: 1,
        column: 1,
        message: message,
        severity: diagnostic.category === ts.DiagnosticCategory.Error ? 'error' : 'warning',
        category: 'typescript-config',
        code: diagnostic.code,
        source: 'typescript-compiler-api'
      };
    }
  }
}

/**
 * Railway Compilation Validator
 * Provides full compilation validation using Railway's complete environment
 */
export class RailwayCompilationValidator {
  constructor(projectRoot, boilerplateDir, previewsRoot) {
    this.projectRoot = projectRoot;
    this.boilerplateDir = boilerplateDir;
    this.previewsRoot = previewsRoot;
    this.tsCompiler = new TypeScriptCompilerService();
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
      await this.createTempProjectForValidation(tempDir, filesArray, runCommand);
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
      
      // Skip build validation since TypeScript validation now uses Next.js build
      if (validationConfig.enableBuild) {
        validationPromises.push(this.validateBuild(projectId, tempDir, runCommand));
      }
      
      if (validationConfig.enableRuntimeChecks) {
        validationPromises.push(this.validateRuntimeChecks(projectId, filesArray));
      }
      
      // 3. Wait for all validations to complete with timeout
      console.log(`[${projectId}] 🔍 Running ${validationPromises.length} validation checks...`);
      
      // Add timeout to prevent hanging validations (5 minutes max)
      const VALIDATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Validation timeout after ${VALIDATION_TIMEOUT_MS}ms`)), VALIDATION_TIMEOUT_MS);
      });
      
      const results = await Promise.race([
        Promise.all(validationPromises),
        timeoutPromise
      ]);
      
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
      
    } catch (error) {
      const compilationTime = Date.now() - startTime;
      console.error(`[${projectId}] ❌ Validation failed after ${compilationTime}ms:`, error.message);
      
      // Handle timeout specifically
      if (error.message.includes('timeout')) {
        return {
          success: false,
          errors: [{
            file: 'validation-timeout',
            line: 1,
            column: 1,
            message: `Validation timed out after ${VALIDATION_TIMEOUT_MS}ms. This may indicate slow compilation or hanging processes.`,
            severity: 'error',
            category: 'validation-timeout',
            source: 'validation-system'
          }],
          warnings: [],
          info: [],
          files: filesArray.map(f => ({ filename: f.path, content: f.content })),
          compilationTime,
          validationSummary: 'Validation timed out'
        };
      }
      
      // Handle other validation errors
      return {
        success: false,
        errors: [{
          file: 'validation-error',
          line: 1,
          column: 1,
          message: `Validation failed: ${error.message}`,
          severity: 'error',
          category: 'validation-error',
          source: 'validation-system'
        }],
        warnings: [],
        info: [],
        files: filesArray.map(f => ({ filename: f.path, content: f.content })),
        compilationTime,
        validationSummary: 'Validation failed'
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
  async createTempProjectForValidation(tempDir, filesArray, runCommand) {
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
    
    // Install dependencies for validation
    console.log(`Installing dependencies for validation...`);
    try {
      const result = await runCommand("npm", ["install"], { 
        id: "validation", 
        cwd: tempDir 
      });
      console.log(`Dependencies installed successfully`);
    } catch (error) {
      console.warn(`Failed to install dependencies:`, error.message);
      // Continue with validation even if npm install fails
    }
  }

  /**
   * TypeScript compilation validation using TypeScript Compiler API
   */
  async validateTypeScript(projectId, tempDir, runCommand) {
    const startTime = Date.now();
    try {
      console.log(`[${projectId}] 🔍 TypeScript validation started...`);
      
      // Use TypeScript Compiler API for structured diagnostics
      const result = await this.tsCompiler.validateTypeScriptFiles(projectId, tempDir);
      
      const duration = Date.now() - startTime;
      console.log(`[${projectId}] ✅ TypeScript validation completed in ${duration}ms:`);
      console.log(`[${projectId}]   ❌ Errors: ${result.errors.length}`);
      console.log(`[${projectId}]   ⚠️  Warnings: ${result.warnings.length}`);
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${projectId}] ❌ TypeScript validation failed after ${duration}ms:`, error.message);
      return {
        errors: [{
          file: 'typescript-validation',
          line: 1,
          column: 1,
          message: `TypeScript validation error: ${error.message}`,
          severity: 'error',
          category: 'typescript-validation',
          source: 'typescript-compiler-api'
        }],
        warnings: []
      };
    }
  }

  /**
   * Solidity compilation validation
   */
  async validateSolidity(projectId, tempDir, runCommand) {
    const startTime = Date.now();
    const contractsDir = path.join(tempDir, 'contracts');
    if (!existsSync(contractsDir)) {
      console.log(`[${projectId}] 📁 No contracts directory found, skipping Solidity validation`);
      return { errors: [], warnings: [] };
    }

    // Check if contract deployment is enabled
    const enableContractDeployment = process.env.ENABLE_CONTRACT_DEPLOYMENT === "true";
    if (!enableContractDeployment) {
      console.log(`[${projectId}] 🔧 Contract deployment disabled, skipping Solidity validation`);
      return { errors: [], warnings: [] };
    }

    console.log(`[${projectId}] 🔍 Solidity validation started...`);

    try {
      const { stdout, stderr } = await runCommand(
        "npx",
        ["hardhat", "compile", "--force"],
        { id: projectId, cwd: contractsDir } // Run from contracts directory
      );

      const output = `${stdout}\n${stderr}`;
      const result = this.parseSolidityErrors(output);
      
      const duration = Date.now() - startTime;
      console.log(`[${projectId}] ✅ Solidity validation completed in ${duration}ms:`);
      console.log(`[${projectId}]   ❌ Errors: ${result.errors.length}`);
      console.log(`[${projectId}]   ⚠️  Warnings: ${result.warnings.length}`);
      
      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(`[${projectId}] ⚠️ Solidity validation failed after ${duration}ms`);
      // Use error.output which contains both stdout and stderr, fallback to individual streams
      const output = error.output || `${error.stdout || ''}\n${error.stderr || ''}` || error.message || String(error);
      console.log(`[${projectId}] 🔍 Debug - Error output:`, JSON.stringify(output));
      
      const result = this.parseSolidityErrors(output);
      console.log(`[${projectId}] ✅ Solidity validation completed in ${duration}ms:`);
      console.log(`[${projectId}]   ❌ Errors: ${result.errors.length}`);
      console.log(`[${projectId}]   ⚠️  Warnings: ${result.warnings.length}`);
      
      return result;
    }
  }

  /**
   * ESLint validation using globally available ESLint
   */
  async validateESLint(projectId, tempDir, runCommand) {
    const startTime = Date.now();
    try {
      console.log(`[${projectId}] 🔍 ESLint validation started...`);
      
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
      
      const result = await runCommand(command, args, { 
        id: projectId, 
        cwd: tempDir 
      });
      
      const duration = Date.now() - startTime;
      console.log(`[${projectId}] ✅ ESLint validation completed in ${duration}ms:`);
      console.log(`[${projectId}]   ❌ Errors: 0`);
      console.log(`[${projectId}]   ⚠️  Warnings: 0`);
      return { errors: [], warnings: [] };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(`[${projectId}] ⚠️ ESLint validation found errors after ${duration}ms`);
      
      // Use the same approach as local validation - check for command failure
      if (error.code === 1 || error.code === 2) {
        // Command failed - parse the actual output
        const output = error.output || `${error.stdout || ''}\n${error.stderr || ''}` || error.message || String(error);
        const result = this.parseESLintErrors(output);
        console.log(`[${projectId}] ✅ ESLint validation completed in ${duration}ms:`);
        console.log(`[${projectId}]   ❌ Errors: ${result.errors.length}`);
        console.log(`[${projectId}]   ⚠️  Warnings: ${result.warnings.length}`);
        return result;
      } else {
        // Unexpected error
        console.error(`[${projectId}] ❌ ESLint validation failed after ${duration}ms:`, error.message);
        return {
          errors: [{
            file: 'eslint-validation',
            line: 1,
            column: 1,
            message: `ESLint validation failed: ${error.message}`,
            severity: 'error',
            category: 'eslint',
            source: 'railway'
          }],
          warnings: []
        };
      }
    }
  }

  /**
   * Next.js build validation using globally available Next.js
   */
  async validateBuild(projectId, tempDir, runCommand) {
    const startTime = Date.now();
    try {
      console.log(`[${projectId}] 🔍 Next.js build validation started...`);
      
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
      
      const result = await runCommand(command, args, { 
        id: projectId, 
        cwd: tempDir 
      });
      
      const duration = Date.now() - startTime;
      console.log(`[${projectId}] ✅ Next.js build validation completed in ${duration}ms:`);
      console.log(`[${projectId}]   ❌ Errors: 0`);
      console.log(`[${projectId}]   ⚠️  Warnings: 0`);
      return { errors: [], warnings: [] };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(`[${projectId}] ⚠️ Next.js build validation found errors after ${duration}ms`);
      const result = this.parseBuildErrors(error.message || error.toString());
      console.log(`[${projectId}] ✅ Next.js build validation completed in ${duration}ms:`);
      console.log(`[${projectId}]   ❌ Errors: ${result.errors.length}`);
      console.log(`[${projectId}]   ⚠️  Warnings: ${result.warnings.length}`);
      return result;
    }
  }

  /**
   * Runtime checks validation
   */
  async validateRuntimeChecks(projectId, filesArray) {
    const startTime = Date.now();
    console.log(`[${projectId}] 🔍 Runtime checks validation started...`);
    
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
    
    const duration = Date.now() - startTime;
    console.log(`[${projectId}] ✅ Runtime checks validation completed in ${duration}ms:`);
    console.log(`[${projectId}]   ❌ Errors: ${errors.length}`);
    console.log(`[${projectId}]   ⚠️  Warnings: ${warnings.length}`);
    console.log(`[${projectId}]   ℹ️  Info: ${info.length}`);
    
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
   * Parse Solidity (Hardhat) compiler output
   */
  parseSolidityErrors(errorOutput) {
    console.log(`🔍 Debug - Parsing Solidity output:`, JSON.stringify(errorOutput));
    
    const errors = [];
    const warnings = [];
    
    if (!errorOutput || errorOutput.trim() === '') {
      console.log(`🔍 Debug - Empty output received`);
      return { errors, warnings };
    }
    
    // Enhanced regex for modern Solidity error format: "ErrorType: message\n  --> file:line:col:"
    const modernRegex = /(TypeError|ParserError|SyntaxError|DeclarationError|CompileError|InternalCompilerError|Warning|Info):\s*(.+?)\s*\n\s*-->\s*(.+?):(\d+):(\d+):/gs;

    let match;
    while ((match = modernRegex.exec(errorOutput)) !== null) {
      const [, level, message, file, line, column] = match;
      const entry = {
        file: path.relative(process.cwd(), file.trim()),
        line: parseInt(line, 10),
        column: parseInt(column, 10),
        message: message.trim(),
        severity: level === 'Warning' || level === 'Info' ? 'warning' : 'error',
        category: 'solidity',
        source: 'hardhat-compiler'
      };
      (level === 'Warning' || level === 'Info' ? warnings : errors).push(entry);
    }

    // Enhanced regex for legacy format: "file:line:col: ErrorType: message"
    const legacyRegex = /(.+?):(\d+):(\d+):\s*(TypeError|ParserError|SyntaxError|DeclarationError|CompileError|InternalCompilerError|Warning|Info):\s*(.+)/g;
    while ((match = legacyRegex.exec(errorOutput)) !== null) {
      const [, file, line, column, level, message] = match;
      const entry = {
        file: path.relative(process.cwd(), file.trim()),
        line: parseInt(line, 10),
        column: parseInt(column, 10),
        message: message.trim(),
        severity: level === 'Warning' || level === 'Info' ? 'warning' : 'error',
        category: 'solidity',
        source: 'hardhat-compiler'
      };
      (level === 'Warning' || level === 'Info' ? warnings : errors).push(entry);
    }

    // Handle Hardhat-specific errors (HH600, etc.)
    const hardhatErrorRegex = /Error HH\d+:\s*(.+)/g;
    while ((match = hardhatErrorRegex.exec(errorOutput)) !== null) {
      const [, message] = match;
      errors.push({
        file: 'hardhat',
        line: 1,
        column: 1,
        message: message.trim(),
        severity: 'error',
        category: 'solidity',
        source: 'hardhat'
      });
    }

    // Fallback for any remaining compilation errors
    if (!errors.length && !warnings.length && (errorOutput.includes('Error') || errorOutput.includes('failed') || errorOutput.includes('compilation'))) {
      errors.push({
        file: 'solidity',
        line: 1,
        column: 1,
        message: errorOutput.trim(),
        severity: 'error',
        category: 'solidity',
        source: 'hardhat'
      });
    }

    console.log(`🔍 Final result:`, { errors: errors.length, warnings: warnings.length });
    return { errors, warnings };
  }

  /**
   * Parse ESLint errors
   */
  parseESLintErrors(errorOutput) {
    const errors = [];
    const warnings = [];
    
    try {
      const eslintResults = JSON.parse(errorOutput);
      for (const result of eslintResults) {
        for (const message of result.messages) {
          const error = {
            file: result.filePath,
            line: message.line,
            column: message.column,
            message: message.message,
            severity: message.severity === 2 ? 'error' : 'warning',
            category: 'eslint',
            rule: message.ruleId,
            source: 'eslint'
          };
          
          if (message.severity === 2) {
            errors.push(error);
          } else {
            warnings.push(error);
          }
        }
      }
    } catch (parseError) {
      // Enhanced fallback parsing for ESLint configuration errors and other issues
      const lines = errorOutput.split('\n');
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;
        
        // ESLint configuration errors and other issues
        if (trimmedLine.includes('Cannot read config file') || 
            trimmedLine.includes('Failed to patch ESLint') ||
            trimmedLine.includes('Error:') ||
            trimmedLine.includes('error') ||
            trimmedLine.includes('warning')) {
          const error = {
            file: 'eslint-config',
            line: 1,
            column: 1,
            message: trimmedLine,
            severity: trimmedLine.includes('error') || trimmedLine.includes('Error:') ? 'error' : 'warning',
            category: 'eslint',
            source: 'eslint'
          };
          
          if (error.severity === 'error') {
            errors.push(error);
          } else {
            warnings.push(error);
          }
        }
      }
      
      // If no errors found but ESLint exited with error, add a generic error
      if (errors.length === 0 && errorOutput.includes('eslint')) {
        errors.push({
          file: 'eslint',
          line: 1,
          column: 1,
          message: `ESLint validation failed: ${errorOutput.trim()}`,
          severity: 'error',
          category: 'eslint',
          source: 'eslint'
        });
      }
    }
    
    return { errors, warnings };
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

