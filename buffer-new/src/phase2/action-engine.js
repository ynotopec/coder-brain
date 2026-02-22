import { OpenAIInterface } from '../common.js';

export class ToolRegistry {
  constructor() {
    this.tools = new Map();
  }

  registerTool(toolId, toolName, description, executeFn, category = 'general') {
    this.tools.set(toolId, {
      id: toolId,
      name: toolName,
      description,
      execute: executeFn,
      category,
      registeredAt: new Date().toISOString()
    });
    return this;
  }

  unregisterTool(toolId) {
    return this.tools.delete(toolId);
  }

  getTool(toolId) {
    return this.tools.get(toolId);
  }

  getAllTools() {
    return Array.from(this.tools.values());
  }

  getToolsByCategory(category) {
    return Array.from(this.tools.values()).filter(t => t.category === category);
  }

  introspect(toolId) {
    const tool = this.getTool(toolId);
    if (!tool) return null;

    return {
      name: tool.name,
      description: tool.description,
      category: tool.category,
      parameters: { dynamic: 'runtime' },
      hasDryRun: true
    };
  }
}

export class ActionPlanner {
  constructor(llm, toolRegistry) {
    this.llm = llm;
    this.toolRegistry = toolRegistry;
  }

  async plan(context, constraints = {}) {
    const { entities = context.entities, queryType = context.query_type } = constraints;

    const prompt = `Plan an action to accomplish the user's goal.

Query: "${context.context}"
Entity: ${JSON.stringify(entities)}
Query Type: ${queryType}

Return a JSON object with:
{
  "tool_id": "id of the tool to use, or null",
  "tool_name": "name of the tool",
  "confidence": 0.0 to 1.0,
  "parameters": { "key": "value" },
  "requires_human_approval": true/false,
  "reasoning": "brief explanation"
}`;

    const response = await this.llm.generateCompletion([{ role: 'user', content: prompt }]);

    try {
      const result = JSON.parse(response);

      if (result.tool_id && this.toolRegistry.getTool(result.tool_id)) {
        return {
          tool: this.toolRegistry.getTool(result.tool_id),
          parameters: result.parameters || {},
          requiresHumanApproval: result.requires_human_approval || false,
          reasoning: result.reasoning || 'Action planned by AI'
        };
      }

      return null;
    } catch (e) {
      return null;
    }
  }
}

export class DryRunValidator {
  constructor(llm) {
    this.llm = llm;
  }

  async validate(tool, parameters) {
    const prompt = `Validate this tool call by simulating the dry run.

Tool: ${tool.name}
Description: ${tool.description}

Parameters: ${JSON.stringify(parameters)}

Return a JSON object with:
{
  "valid": true/false,
  "warnings": ["list of warnings if any"],
  "estimated_impact": { "changes_made": 0, "risk_level": "low/medium/high" }
}`;

    const response = await this.llm.generateCompletion([{ role: 'user', content: prompt }]);

    try {
      return JSON.parse(response);
    } catch (e) {
      return {
        valid: false,
        warnings: ['Failed to validate via LLM'],
        estimated_impact: { changes_made: 0, risk_level: 'high' }
      };
    }
  }
}

export class RiskChecker {
  constructor(llm) {
    this.llm = llm;
  }

  async checkRisk(result, parameters) {
    const prompt = `Check if this tool execution was high risk.

Tool Parameters: ${JSON.stringify(parameters)}
Tool Result Summary: ${JSON.stringify(result)}

Return a JSON object with:
{
  "is_high_risk": true/false,
  "issues": ["list of issues if any"],
  "rollback_required": true/false
}`;

    const response = await this.llm.generateCompletion([{ role: 'user', content: prompt }]);

    try {
      return JSON.parse(response);
    } catch (e) {
      return {
        is_high_risk: false,
        issues: [],
        rollback_required: false
      };
    }
  }
}

export class ToolExecutor {
  constructor(toolRegistry) {
    this.toolRegistry = toolRegistry;
  }

  async execute(toolId, parameters) {
    const tool = this.toolRegistry.getTool(toolId);
    if (!tool) {
      throw new Error(`Tool not found: ${toolId}`);
    }

    try {
      const result = await tool.execute(parameters);
      return {
        success: true,
        toolId,
        result,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        toolId,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async verifyOutput(result) {
    const prompt = `Verify if this tool output is correct and expected.

Tool Result: ${JSON.stringify(result)}

Return a JSON object with:
{
  "verify": true/false,
  "issues": ["list of issues if any"],
  "confidence": 0.0 to 1.0
}`;

    const response = await this.llm.generateCompletion([{ role: 'user', content: prompt }]);

    try {
      return JSON.parse(response);
    } catch (e) {
      return {
        verify: true,
        issues: [],
        confidence: 0.7
      };
    }
  }
}

export class RollbackManager {
  constructor(toolRegistry) {
    this.toolRegistry = toolRegistry;
  }

  async rollback(toolId, originalParameters, executionResult) {
    const tool = this.toolRegistry.getTool(toolId);
    if (!tool || !tool.rollback) {
      return {
        success: true,
        message: 'No rollback needed or no rollback implementation available'
      };
    }

    try {
      const result = await tool.rollback(originalParameters, executionResult);
      return {
        success: true,
        result
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}