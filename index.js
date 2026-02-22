import fs from 'fs';
import path from 'path';

const loadEnvFile = () => {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
};

loadEnvFile();

import { OpenAIInterface } from './src/common.js';
import { ContextBuilder, IntentRouter, LongTermMemory } from './src/phase1/context.js';
import { VectorStore, AnswerGenerator, QueryPlanner, Reranker } from './src/phase2/rag-engine.js';
import { ToolRegistry, ActionPlanner, DryRunValidator, RiskChecker, ToolExecutor, RollbackManager } from './src/phase2/action-engine.js';
import { HybridOrchestrator } from './src/phase2/hybrid-orchestrator.js';
import { SafetyChecker, ObservabilityLog, DirectReplier } from './src/phase2/chat-safety.js';
import { ResponseAggregator, ParallelEvaluator, QualityScoreCalculator } from './src/phase3/response-aggregator.js';
import { RefinementManager, OutputWriter, RetryGatekeeper, SchemaAndEmbedder } from './src/phase4/output-learning.js';

export class BrainSystem {
  constructor(config = {}) {
    this.llm = new OpenAIInterface(process.env.OPENAI_API_KEY);
    this.observabilityLog = new ObservabilityLog();

    this.longTermMemory = new LongTermMemory(new VectorStore());
    this.contextBuilder = new ContextBuilder(this.llm, this.longTermMemory.vectorStore, this.longTermMemory);
    this.intentRouter = new IntentRouter(this.llm);

    this.ragEngine = {
      vectorStore: new VectorStore(),
      queryPlanner: new QueryPlanner(this.llm),
      reranker: new Reranker(this.llm),
      answerGenerator: new AnswerGenerator(this.llm)
    };

    this.toolRegistry = new ToolRegistry();
    this.actionEngine = {
      actionPlanner: new ActionPlanner(this.llm, this.toolRegistry),
      dryRunValidator: new DryRunValidator(this.llm),
      riskChecker: new RiskChecker(this.llm),
      toolExecutor: new ToolExecutor(this.toolRegistry, this.llm),
      rollbackManager: new RollbackManager(this.toolRegistry)
    };


    this.safetyChecker = new SafetyChecker(this.llm, this.observabilityLog);
    this.chatReplier = new DirectReplier(this.llm);

    this.hybridOrchestrator = new HybridOrchestrator({
      ragEnabled: true,
      actionEnabled: true,
      chatEnabled: true,
      chatHandler: async (context) => {
        const message = await this.safetyChecker.generateChatResponse(context.context);
        return { message, type: 'chat', confidence: 0.8 };
      }
    });

    this.responseAggregator = new ResponseAggregator(this.llm);
    this.parallelEvaluator = new ParallelEvaluator(null, null, null, this.llm);
    this.parallelEvaluator.ragResults = null;
    this.parallelEvaluator.actionResults = null;
    this.parallelEvaluator.chatResults = null;
    this.qualityCalculator = new QualityScoreCalculator();

    this.refinementManager = new RefinementManager(this.llm, this.ragEngine.vectorStore);
    this.outputWriter = new OutputWriter(this.observabilityLog);
    this.retryGatekeeper = new RetryGatekeeper();

    this._initializeSampleTools();
  }

  async processUserInput(input) {
    this.retryGatekeeper.reset();

    try {
      return await this._processWithRetry(input);
    } catch (error) {
      console.error('[BRAIN SYSTEM] Critical error:', error);
      this.observabilityLog.logError('critical', error.message);

      return {
        status: 'error',
        message: 'An unexpected error occurred',
        error: error.message
      };
    }
  }

  async _processWithRetry(input) {
    const maxRetries = 2;
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        this.observabilityLog.logDebug('attempt', { attempt, input });

        const result = await this._processSingleAttempt(input, attempt);

        if (result.isValid && result.response) {
          const finalOutput = await this._postProcess(result);
          await this._saveToMemory(input, finalOutput, result.qualityScore);
          return finalOutput;
        }

        const qualityScore = typeof result?.qualityScore === 'number' ? result.qualityScore : 'n/a';
        throw new Error(`Low confidence response (score=${qualityScore})`);
      } catch (error) {
        lastError = error;
        console.warn(`[BRAIN SYSTEM] Attempt ${attempt} failed:`, error.message);
        this.observabilityLog.logError('attempt', error.message);

        if (attempt < maxRetries && this.retryGatekeeper.shouldRetry(error.message)) {
          const refinedInput = await this._refineInput(input, error.message);
          input = refinedInput;
          this.retryGatekeeper.reset();
          continue;
        }
      }
    }

    return {
      status: 'fallback',
      message: 'Impossible de générer une réponse fiable pour le moment. Merci de reformuler votre demande.',
      error: lastError?.message || 'Échec de traitement sans détail technique',
      metadata: {
        phase: 'fallback',
        retries: maxRetries + 1,
        timestamp: new Date().toISOString()
      }
    };
  }

  async _processSingleAttempt(input, attempt) {
    const phase1Input = await this.contextBuilder.normalizeInput(input);
    const context = await this.contextBuilder.buildContext(phase1Input);
    const intent = await this.intentRouter.route(context);

    this.observabilityLog.logDebug('intent', { input: phase1Input.normalized_text, intent });

    return await this._executeByIntent(context, intent, phase1Input);
  }

  async _executeByIntent(context, intent, phase1Input) {
    const results = {
      input: phase1Input.normalized_text,
      context,
      intent,
      phase: 'starting'
    };

    switch (intent.intent) {
      case 'query':
        results.phase = 'rag';
        results.rag = await this._executeRag(context);
        break;

      case 'action':
        results.phase = 'action';
        results.action = await this._executeAction(context);
        break;

      case 'hybrid':
        results.phase = 'hybrid';
        results.all = await this.hybridOrchestrator.orchestrate(context);
        results.rag = results.all?.rag || null;
        results.action = results.all?.action || null;
        results.chat = results.all?.chat || null;
        break;

      case 'chat':
      default:
        results.phase = 'chat';
        results.chat = await this._executeChat(context);
        break;
    }

    const aggregated = await this.responseAggregator.aggregate(results, context);

    return {
      source: aggregated.source,
      response: aggregated.response,
      qualityScore: aggregated.qualityScore,
      phase: results.phase,
      isValid: aggregated.qualityScore > 0.5
    };
  }

  async _executeRag(context) {
    const planner = await this.ragEngine.queryPlanner.plan(context);

    if (!planner) {
      return null;
    }

    const queryEmbedding = await this.ragEngine.vectorStore.embed(context.context);
    const results = await this.ragEngine.vectorStore.search(
      queryEmbedding,
      planner?.parameters?.top_k || 5
    );

    if (!results.length) {
      return await this.ragEngine.answerGenerator.fallbackMessage(context.context);
    }

    const reranked = await this.ragEngine.reranker.rerank(results, context.context);
    const answer = await this.ragEngine.answerGenerator.generate(reranked, context.context);

    return answer;
  }

  async _executeAction(context) {
    const plan = await this.actionEngine.actionPlanner.plan(context);

    if (!plan || !plan.tool) {
      return null;
    }

    const toolId = plan.tool.id;

    const dryRun = await this.actionEngine.dryRunValidator.validate(plan.tool, plan.parameters);
    const risk = await this.actionEngine.riskChecker.checkRisk(dryRun, plan.parameters);

    if (risk.is_high_risk) {
      console.warn('[ACTION] High risk detected, skipping execution');
      return null;
    }

    const execution = await this.actionEngine.toolExecutor.execute(toolId, plan.parameters);

    if (execution.success) {
      const verify = await this.actionEngine.toolExecutor.verifyOutput(execution.result);
      return { success: true, toolId, result: execution.result, verify };
    }

    return null;
  }

  async _executeChat(context) {
    const safety = await this.safetyChecker.checkLightSafety(context);

    if (safety.needs_review && safety.suggested_action === 'warn') {
      console.warn('[CHAT] Safety check triggered warnings');
    }

    await this.safetyChecker.recordSafetyCheck(context.context, safety);

    const message = await this.safetyChecker.generateChatResponse(context.context);

    return { message, confidence: 0.8, safety };
  }

  async _refineInput(input, failureReason) {
    const prompt = `Refine this user input based on previous failure.

Original: "${input}"
Failure Reason: "${failureReason}"

Return JSON: { refined: "refined input" }`;

    const response = await this.llm.generateCompletion([
      { role: 'user', content: prompt }
    ]);

    try {
      const result = JSON.parse(response);
      return result.refined || input;
    } catch (e) {
      return input;
    }
  }

  async _postProcess(resultObject) {
    const finalResponse = await this.refinementManager.generateFinalResponse(
      resultObject.response
    );

    return {
      ...finalResponse,
      metadata: {
        phase: resultObject.phase,
        source: resultObject.source,
        timestamp: new Date().toISOString()
      }
    };
  }

  async _saveToMemory(input, output, qualityScore) {
    const worthKeeping = await this.refinementManager.checkWorthKeeping(input, output);

    if (worthKeeping) {
      const schema = await this.refinementManager.constructMemorySchema(input, output);
      await this.refinementManager.embedMemory(output.answer, schema);
    }
  }

  _initializeSampleTools() {
    this.toolRegistry.registerTool(
      'calc',
      'calculator',
      'Perform basic calculations',
      async (params) => {
        if (params.operation === 'add') {
          return params.a + params.b;
        }
        if (params.operation === 'subtract') {
          return params.a - params.b;
        }
        if (params.operation === 'multiply') {
          return params.a * params.b;
        }
        return 0;
      },
      'utility'
    );
  }
}


export { BrainSystem as BufferSystem };
