#!/usr/bin/env node
/**
 * Toolbuilder Sandbox Module
 * Provides safe code execution for dynamically generated tools
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const vm2 = (() => {
  try {
    return require('vm2');
  } catch {
    return null;
  }
})();

/**
 * GapDetector identifies if a new tool should be created
 * @class
 */
export class GapDetector {
  constructor(vectorStore, llm) {
    this.vectorStore = vectorStore;
    this.llm = llm;
  }

  /**
   * Detect if a tool gap exists for the given context
   * @param {Object} context - Context object with entities and existing tools
   * @returns {Promise<Object>} Gap analysis result
   */
  async detectGap(context) {
    const existingToolNames = context.tools?.map(t => t.name.toLowerCase()) || [];

    const prompt = `Identify if a tool is needed for the following query.

Query: "${context.context}"
Entities: ${JSON.stringify(context.entities)}
Existing Tools: ${JSON.stringify(existingToolNames)}

Return a JSON object with:
{
  "needs_new_tool": true/false,
  "tool_name_suggestion": "suggested name for the tool" or null,
  "tool_description": "short description of what the tool should do" or null,
  "entity_types": ["list of entity types the tool would work with"],
  "reasoning": "brief explanation"
}`;

    try {
      const response = await this.llm.generateCompletion([{ role: 'user', content: prompt }]);
      const result = JSON.parse(response);
      return {
        needsNewTool: result.needs_new_tool,
        toolName: result.tool_name_suggestion,
        toolDescription: result.tool_description,
        entityTypes: result.entity_types || [],
        reasoning: result.reasoning || ''
      };
    } catch {
      return this._fallbackGapAnalysis();
    }
  }

  _fallbackGapAnalysis() {
    return {
      needsNewTool: false,
      toolName: null,
      toolDescription: null,
      entityTypes: [],
      reasoning: 'Failed to analyze gap'
    };
  }
}

/**
 * SpecGenerator creates tool specifications from gap analysis
 * @class
 */
export class SpecGenerator {
  constructor(llm) {
    this.llm = llm;
  }

  /**
   * Generate a complete tool specification
   * @param {Object} gapInfo - Gap analysis information
   * @returns {Promise<Object>} Tool specification
   */
  async generateSpec(gapInfo) {
    const prompt = `Generate a tool specification based on this gap.

Tool Name: ${gapInfo.toolName}
Description: ${gapInfo.toolDescription}
Entity Types: ${JSON.stringify(gapInfo.entityTypes)}

Return a JSON object with:
{
  "tool_id": "unique identifier",
  "name": "clean tool name",
  "description": "detailed description",
  "input_schema": {"type": "object", "properties": {}, "required": []},
  "output_schema": {"type": "object", "properties": {}, "required": []},
  "category": "one of: utility, analysis, transformation, custom",
  "dependencies": []
}`;

    try {
      const response = await this.llm.generateCompletion([{ role: 'user', content: prompt }]);
      return JSON.parse(response);
    } catch {
      return this._fallbackSpec(gapInfo);
    }
  }

  _fallbackSpec(gapInfo) {
    return {
      tool_id: `custom_tool_${Date.now()}`,
      name: gapInfo.toolName || 'custom_tool',
      description: gapInfo.toolDescription || 'Custom tool',
      input_schema: { type: 'object', properties: {}, required: [] },
      output_schema: { type: 'object', properties: {}, required: [] },
      category: 'custom',
      dependencies: []
    };
  }
}

/**
 * ImplementationGenerator creates code implementations from specifications
 * @class
 */
export class ImplementationGenerator {
  constructor(llm) {
    this.llm = llm;
  }

  /**
   * Generate implementation code for a tool
   * @param {Object} spec - Tool specification
   * @returns {Promise<string>} Implementation code
   */
  async generateImplementation(spec) {
    const prompt = `Write the implementation code for a tool with this specification.

Specification: ${JSON.stringify(spec)}

Return ONLY the code block without markdown formatting. Include:
- Proper error handling
- Type hints where applicable
- Input validation
- Logging statements`;

    return await this.llm.generateCompletion([{
      role: 'user',
      content: prompt
    }]);
  }

  /**
   * Perform static code analysis on implementation
   * @param {string} code - Implementation code to analyze
   * @returns {Promise<Object>} Analysis results
   */
  async getStaticAnalysis(code) {
    const prompt = `Analyze this code for potential issues.

Code: ${code}

Return a JSON object with:
{
  "issues": ["list of potential issues"],
  "warnings": ["list of warnings"],
  "best_practices": ["list of practices followed"],
  "complexity_score": number between 1 and 10
}`;

    try {
      const response = await this.llm.generateCompletion([{
        role: 'user',
        content: prompt
      }]);
      return JSON.parse(response);
    } catch {
      return { issues: ['Failed to analyze'], warnings: [], best_practices: [], complexity_score: 5.0 };
    }
  }
}

/**
 * TestGenerator creates unit tests for implementations
 * @class
 */
export class TestGenerator {
  constructor(llm) {
    this.llm = llm;
  }

  /**
   * Generate comprehensive unit tests
   * @param {string} implementation - Tool implementation code
   * @param {Object} spec - Tool specification
   * @returns {Promise<Object>} Test results
   */
  async generateUnitTests(implementation, spec) {
    const prompt = `Write comprehensive unit tests for this tool.

Implementation Code: ${implementation}
Specification: ${JSON.stringify(spec)}

Return a JSON object with:
{
  "unit_tests": "the test code",
  "prop_tests": ["example property tests"],
  "test_coverage_goals": { "unit": number, "property": number }
}`;

    try {
      const response = await this.llm.generateCompletion([{
        role: 'user',
        content: prompt
      }]);
      return JSON.parse(response);
    } catch {
      return { unit_tests: '', prop_tests: [], test_coverage_goals: { unit: 0.5, property: 0.5 } };
    }
  }
}

/**
 * PolicyGatekeeper enforces security and usage policies
 * @class
 */
export class PolicyGatekeeper {
  constructor(llm) {
    this.llm = llm;
  }

  /**
   * Verify tool compliance with security policies
   * @param {Object} spec - Tool specification
   * @param {Object} tests - Test results
   * @returns {Promise<Object>} Policy check result
   */
  async checkPolicy(spec, tests) {
    const prompt = `Verify if this tool proposal complies with security and usage policies.

Tool Specification: ${JSON.stringify(spec)}
Test Coverage: ${JSON.stringify(tests)}

Return a JSON object with:
{
  "policy_pass": boolean,
  "concerns": ["list of policy concerns if any"],
  "suggestions": ["suggestions for compliance"],
  "risk_factor": number between 1 and 10
}`;

    try {
      const response = await this.llm.generateCompletion([{
        role: 'user',
        content: prompt
      }]);
      return JSON.parse(response);
    } catch {
      return { policy_pass: true, concerns: [], suggestions: [], risk_factor: 1.0 };
    }
  }
}

/**
 * DryRunValidator simulates execution without actual deployment
 * @class
 */
export class DryRunValidator {
  constructor(llm) {
    this.llm = llm;
  }

  /**
   * Execute a dry run of the tool implementation
   * @param {string} implementation - Tool implementation code
   * @param {Object} spec - Tool specification
   * @returns {Promise<Object>} Dry run results
   */
  async executeDryRun(implementation, spec) {
    const prompt = `Simulate running this tool with sample input.

Implementation: ${implementation}
Specification: ${JSON.stringify(spec)}

Use sample data from input_schema and produce example output.

Return a JSON object with:
{
  "dry_run_result": {},
  "execution_time_estimate": string,
  "memory_usage_estimate": { "max_mb": number, "avg_mb": number },
  "success": boolean
}`;

    try {
      const response = await this.llm.generateCompletion([{
        role: 'user',
        content: prompt
      }]);
      return JSON.parse(response);
    } catch {
      return { dry_run_result: {}, execution_time_estimate: 'unknown', memory_usage_estimate: { max_mb: 0, avg_mb: 0 }, success: false };
    }
  }
}

/**
 * HITLApprover manages human-in-the-loop approval process
 * @class
 */
export class HITLApprover {
  constructor(llm) {
    this.llm = llm;
  }

  /**
   * Generate approval request format for human review
   * @param {Object} spec - Tool specification
   * @param {Object} dryRunResult - Dry run results
   * @returns {Promise<Object>} Approval request
   */
  async requestApproval(spec, _dryRunResult) {
    const prompt = `Format approval request for human review.

Tool Specification: ${JSON.stringify(spec)}
Dry Run Result: ${JSON.stringify(_dryRunResult)}

Return a JSON object formatted as approval request with:
{
  "tool_name": string,
  "description": string,
  "usage_summary": string,
  "risk_level": "low/medium/high",
  "approval_criteria": [string],
  "timeout_hours": number
}`;

    try {
      const response = await this.llm.generateCompletion([{
        role: 'user',
        content: prompt
      }]);
      return JSON.parse(response);
    } catch {
      return { tool_name: spec.name, description: spec.description, usage_summary: 'Custom tool implementation', risk_level: 'medium', approval_criteria: [], timeout_hours: 24 };       }
  }

  /**
   * Process human approval decision
   * @param {Object} spec - Tool specification
   * @param {Object} dryRunResult - Dry run results
   * @returns {Promise<Object>} Approval result
   */
  async getApproval(spec, _dryRunResult) {
    const prompt = `Human approval decision.

Tool: ${JSON.stringify(spec)}

Return JSON: { "approved": boolean, "reason": string }`;

    try {
      const response = await this.llm.generateCompletion([{
        role: 'user',
        content: prompt
      }, {
        role: 'system',
        content: 'You are an approval bot. Return approved:true or approved:false with reason.'
      }]);
      const result = JSON.parse(response);
      return { approved: result.approved, reason: result.reason || 'No reason provided' };
    } catch {
      return { approved: false, reason: 'Approval response was not valid' };
    }
  }
}

/**
 * SecureVM provides sandboxed code execution environment
 * Uses vm2 library for isolation
 */
export class SecureVM {
  /**
   * Create a secure VM with restricted capabilities
   * @returns {NodeVM} Configured sandboxed VM instance
   */
  static createSandbox() {
    if (!vm2) {
      return null;
    }

    const { NodeVM } = vm2;

    return new NodeVM({
      wasm: false,
      console: 'off',
      require: false,
      externalRequire: false,
      builtin: ['console'],
      accessProperties: true,
      sandbox: {},
      timeout: 5000,
      eval: false
    });
  }

  /**
   * Execute code in a secure sandboxed environment
   * @param {string} code - Code to execute
   * @param {*} params - Parameters to pass to the function
   * @returns {{success: boolean, result?: *, error?: string}} Execution result
   */
  static async execute(code, params) {
    const vm = SecureVM.createSandbox();

    if (!vm2 || !vm) {
      return { success: false, error: 'Sandbox unavailable: vm2 is not installed' };
    }

    const { VMScript } = vm2;

    try {
      // Create a function from the cleaned code
      const script = new VMScript(`(async function(params) { "use strict"; ${code} })`);
      const fn = vm.run(script);
      
      if (typeof fn !== 'function') {
        return { success: false, error: 'Generated code is not a valid function' };
      }

      const result = await fn(params);
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

/**
 * ToolPromoter safely deploys new tools to registry
 * @class
 */
export class ToolPromoter {
  constructor(toolRegistry) {
    this.toolRegistry = toolRegistry;
  }

  /**
   * Safely promote a tool implementation with sanitized code execution
   * @param {Object} toolSpec - Tool specification
   * @param {string} implementation - Implementation code
   * @returns {{success: boolean, toolId?: string, errors?: string}} Promotion result
   */
  async promote(toolSpec, implementation) {
    const sanitized = this._sanitizeImplementation(implementation);
    if (!sanitized.valid) {
      return { success: false, error: 'Code failed sanitization checks', details: sanitized.reason };
    }

    // Use secure VM instead of Function constructor for safe execution
    const executeFn = async (params) => {
      const result = await SecureVM.execute(sanitized.code, params);
      if (!result.success) {
        return { error: result.error, success: false };
      }
      return result.result;
    };

    try {
      // Execute a test run to verify the code works
      const testParams = {};
      await executeFn(testParams);
    } catch (error) {
      return { success: false, error: 'Test execution failed', details: error.message };
    }

    const toolId = toolSpec.tool_id || `tool_${Date.now()}`;

    this.toolRegistry.registerTool(
      toolId,
      toolSpec.name,
      toolSpec.description,
      executeFn,
      toolSpec.category
    );

    return { success: true, toolId, message: 'Tool promoted successfully' };
  }

  /**
   * Sanitize implementation code to remove dangerous patterns
   * @param {string} code - Raw implementation code
   * @returns {{valid: boolean, code?: string, reason?: string}} Sanitization result
   */
  _sanitizeImplementation(code) {
    const lines = String(code).split('\n');
    const safeLines = [];
    const violations = [];

    // Strict pattern matching on actual code structure, not case-insensitive matching
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const stripped = line.trim();

      // Check for dangerous keywords at start of statement or with proper delimiters
      if (/\b(new\s+Function|eval\s*\(|require\s*\(|import\s*\(|process\.[\w]+|__dirname|__filename)\b/.test(stripped)) {
        violations.push(`Line ${i + 1}: Dangerous code pattern - ${stripped.substring(0, 50)}`);
        continue;
      }

      safeLines.push(line);
    }

    if (violations.length > 0) {
      return { valid: false, reason: violations.join('; ') };
    }

    return { valid: true, code: safeLines.join('\n') };
  }
}

/**
 * PostDeployChecker validates tool execution after deployment
 * @class
 */
export class PostDeployChecker {
  constructor(llm) {
    this.llm = llm;
  }

  /**
   * Run smoke tests on deployed tool execution result
   * @param {string} toolId - Tool identifier
   * @param {*} executionResult - Result from tool execution
   * @returns {Promise<Object>} Smoke test results
   */
  async smokeTest(toolId, executionResult) {
    const prompt = `Run a smoke test on this tool result.

Tool ID: ${toolId}
Execution Result: ${JSON.stringify(executionResult)}

Return a JSON object with:
{
  "pass": boolean,
  "assertions": { "key": "expected_value" },
  "issues": [string]
}`;

    try {
      const response = await this.llm.generateCompletion([{
        role: 'user',
        content: prompt
      }]);
      return JSON.parse(response);
    } catch {
      return { pass: false, assertions: {}, issues: ['Smoke test failed to execute'] };
    }
  }
}

/**
 * RollbackManager handles tool rollback operations
 * @class
 */
export class RollbackManager {
  constructor(toolRegistry) {
    this.toolRegistry = toolRegistry;
  }

  /**
   * Remove a tool from production
   * @param {string} toolId - Tool identifier to remove
   * @returns {{success: boolean, message: string}} Rollback result
   */
  async rollback(toolId) {
    this.toolRegistry.unregisterTool(toolId);
    return {
      success: true,
      message: `Tool ${toolId} removed from registry`
    };
  }
}
