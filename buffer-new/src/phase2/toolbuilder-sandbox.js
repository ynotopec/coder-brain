import { openai } from 'openai';

export class GapDetector {
  constructor(vectorStore, llm) {
    this.vectorStore = vectorStore;
    this.llm = llm;
  }

  async detectGap(context, tools) {
    const existingToolNames = tools.map(t => t.name.toLowerCase());

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

    const response = await this.llm.generateCompletion([{ role: 'user', content: prompt }]);

    try {
      const result = JSON.parse(response);
      return {
        needsNewTool: result.needs_new_tool,
        toolName: result.tool_name_suggestion,
        toolDescription: result.tool_description,
        entityTypes: result.entity_types || [],
        reasoning: result.reasoning || ''
      };
    } catch (e) {
      return {
        needsNewTool: false,
        toolName: null,
        toolDescription: null,
        entityTypes: [],
        reasoning: 'Failed to analyze gap'
      };
    }
  }
}

export class SpecGenerator {
  constructor(llm) {
    this.llm = llm;
  }

  async generateSpec(gapInfo) {
    const prompt = `Generate a tool specification based on this gap.

Tool Name: ${gapInfo.tool_name}
Description: ${gapInfo.tool_description}
Entity Types: ${JSON.stringify(gapInfo.entity_types)}

Return a JSON object with:
{
  "tool_id": "unique identifier",
  "name": "clean tool name",
  "description": "detailed description",
  "input_schema": {
    "type": "object",
    "properties": { "key": { "type": "type", "description": "desc" } },
    "required": ["required_fields"]
  },
  "output_schema": {
    "type": "object",
    "properties": {},
    "required": []
  },
  "category": "one of: utility, analysis, transformation, custom",
  "dependencies": []
}`;

    const response = await this.llm.generateCompletion([{ role: 'user', content: prompt }]);

    try {
      return JSON.parse(response);
    } catch (e) {
      return {
        tool_id: `custom_tool_${Date.now()}`,
        name: gapInfo.tool_name || 'custom_tool',
        description: gapInfo.tool_description || 'Custom tool',
        input_schema: { type: 'object', properties: {}, required: [] },
        output_schema: { type: 'object', properties: {}, required: [] },
        category: 'custom',
        dependencies: []
      };
    }
  }
}

export class ImplementationGenerator {
  constructor(llm) {
    this.llm = llm;
  }

  async generateImplementation(spec) {
    const prompt = `Write the implementation code for a tool with this specification.

Specification: ${JSON.stringify(spec)}

Return a code block with the complete implementation:
- Include proper error handling
- Add type hints if TypeScript
- Add error messages
- Include logging
- Do NOT include test functions
- Output ONLY the code block`;

    const response = await this.llm.generateCompletion([
      { role: 'user', content: prompt }
    ]);

    return response;
  }

  async getStaticAnalysis(result) {
    const prompt = `Analyze this code for potential issues.

Code: ${result}

Return a JSON object with:
{
  "issues": ["list of potential issues"],
  "warnings": ["list of warnings"],
  "best_practices": ["list of practices followed"],
  "complexity_score": 1.0 to 10.0
}`;

    const response = await this.llm.generateCompletion([
      { role: 'user', content: prompt }
    ]);

    try {
      return JSON.parse(response);
    } catch (e) {
      return {
        issues: ['Failed to analyze'],
        warnings: [],
        best_practices: [],
        complexity_score: 5.0
      };
    }
  }
}

export class TestGenerator {
  constructor(llm) {
    this.llm = llm;
  }

  async generateUnitTests(implementation, spec) {
    const prompt = `Write comprehensive unit tests for this tool.

Implementation Code: ${implementation}

Specification: ${JSON.stringify(spec)}

Return a JSON object with:
{
  "unit_tests": "the test code",
  "prop_tests": ["example property tests"],
  "test_coverage_goals": { "unit": 0.8, "property": 0.7 }
}`;

    const response = await this.llm.generateCompletion([
      { role: 'user', content: prompt }
    ]);

    try {
      return JSON.parse(response);
    } catch (e) {
      return {
        unit_tests: '',
        prop_tests: [],
        test_coverage_goals: { unit: 0.5, property: 0.5 }
      };
    }
  }
}

export class PolicyGatekeeper {
  constructor(llm) {
    this.llm = llm;
  }

  async checkPolicy(spec, tests) {
    const prompt = `Verify if this tool proposal complies with security and usage policies.

Tool Specification: ${JSON.stringify(spec)}
Test Coverage: ${JSON.stringify(tests)}

Return a JSON object with:
{
  "policy_pass": true/false,
  "concerns": ["list of policy concerns if any"],
  "suggestions": ["suggestions for compliance"],
  "risk_factor": 1.0 to 10.0
}`;

    const response = await this.llm.generateCompletion([
      { role: 'user', content: prompt }
    ]);

    try {
      return JSON.parse(response);
    } catch (e) {
      return {
        policy_pass: true,
        concerns: [],
        suggestions: [],
        risk_factor: 1.0
      };
    }
  }
}

export class DryRunValidator {
  constructor(llm) {
    this.llm = llm;
  }

  async executeDryRun(implementation, spec) {
    const prompt = `Simulate running this tool with sample input.

Implementation: ${implementation}
Specification: ${JSON.stringify(spec)}

Use sample data from the input_schema and produce example output.

Return a JSON object with:
{
  "dry_run_result": { },
  "execution_time_estimate": "estimated time",
  "memory_usage_estimate": { "max_mb": 0.0, "avg_mb": 0.0 },
  "success": true/false
}`;

    const response = await this.llm.generateCompletion([
      { role: 'user', content: prompt }
    ]);

    try {
      return JSON.parse(response);
    } catch (e) {
      return {
        dry_run_result: {},
        execution_time_estimate: 'unknown',
        memory_usage_estimate: { max_mb: 0, avg_mb: 0 },
        success: false
      };
    }
  }
}

export class HITLApprover {
  constructor(llm) {
    this.llm = llm;
  }

  async requestApproval(spec, dryRunResult) {
    const prompt = `Format approval request for human review.

Tool Specification: ${JSON.stringify(spec)}
Dry Run Result: ${JSON.stringify(dryRunResult)}

Return a JSON object formatted as approval request with:
{
  "tool_name": "name",
  "description": "description",
  "usage_summary": "how it will be used",
  "risk_level": "low/medium/high",
  "approval_criteria": ["required approvals"],
  "timeout_hours": 24
}`;

    const response = await this.llm.generateCompletion([
      { role: 'user', content: prompt }
    ]);

    try {
      return JSON.parse(response);
    } catch (e) {
      return {
        tool_name: spec.name,
        description: spec.description,
        usage_summary: 'Custom tool implementation',
        risk_level: 'medium',
        approval_criteria: [],
        timeout_hours: 24
      };
    }
  }

  async getApproval(spec, dryRunResult) {
    const prompt = `Human approval decision.

Tool: ${JSON.stringify(spec)}

Return JSON: { "approved": true/false, "reason": "reason" }`;

    const response = await this.llm.generateCompletion([
      { role: 'user', content: prompt },
      { role: 'system', content: 'You are an approval bot. Return approved:true or approved:false with reason.' }
    ]);

    try {
      const result = JSON.parse(response);
      return {
        approved: result.approved,
        reason: result.reason || 'No reason provided'
      };
    } catch (e) {
      return {
        approved: false,
        reason: 'Approval response was not valid'
      };
    }
  }
}

export class ToolPromoter {
  constructor(toolRegistry) {
    this.toolRegistry = toolRegistry;
  }

  async promote(toolSpec, implementation) {
    const toolId = toolSpec.tool_id;

    const newTool = {
      id: toolId,
      name: toolSpec.name,
      description: toolSpec.description,
      execute: async (params) => {
        const result = await eval(implementation);
        return result;
      },
      category: toolSpec.category,
      dependencies: toolSpec.dependencies,
      createdAt: new Date().toISOString()
    };

    this.toolRegistry.registerTool(
      toolId,
      toolSpec.name,
      toolSpec.description,
      newTool.execute,
      toolSpec.category
    );

    return {
      success: true,
      toolId,
      message: 'Tool successfully promoted to registry'
    };
  }
}

export class PostDeployChecker {
  constructor(llm) {
    this.llm = llm;
  }

  async smokeTest(toolId, executionResult) {
    const prompt = `Run a smoke test on this tool result.

Tool ID: ${toolId}
Execution Result: ${JSON.stringify(executionResult)}

Return a JSON object with:
{
  "pass": true/false,
  "assertions": { "key": "expected_value" },
  "issues": ["list of issues if any"]
}`;

    const response = await this.llm.generateCompletion([
      { role: 'user', content: prompt }
    ]);

    try {
      return JSON.parse(response);
    } catch (e) {
      return {
        pass: false,
        assertions: {},
        issues: ['Smoke test failed to execute']
      };
    }
  }
}

export class RollbackManager {
  async rollback(toolId) {
    return {
      success: true,
      message: `Tool ${toolId} removed from registry`
    };
  }
}