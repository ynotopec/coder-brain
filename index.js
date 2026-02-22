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
import {
  GapDetector,
  SpecGenerator,
  ImplementationGenerator,
  TestGenerator,
  PolicyGatekeeper,
  DryRunValidator as ToolBuilderDryRunValidator,
  HITLApprover,
  ToolPromoter,
  PostDeployChecker
} from './src/phase2/toolbuilder-sandbox.js';
import { HybridOrchestrator } from './src/phase2/hybrid-orchestrator.js';
import { SafetyChecker, ObservabilityLog, DirectReplier } from './src/phase2/chat-safety.js';
import {
  ResponseAggregator,
  ParallelEvaluator,
  QualityScoreCalculator,
  SafetyPolicyValidator,
  ToolOutcomeValidator
} from './src/phase3/response-aggregator.js';
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

    this.toolBuilder = {
      gapDetector: new GapDetector(this.ragEngine.vectorStore, this.llm),
      specGenerator: new SpecGenerator(this.llm),
      implementationGenerator: new ImplementationGenerator(this.llm),
      testGenerator: new TestGenerator(this.llm),
      policyGatekeeper: new PolicyGatekeeper(this.llm),
      dryRunValidator: new ToolBuilderDryRunValidator(this.llm),
      hitlApprover: new HITLApprover(this.llm),
      toolPromoter: new ToolPromoter(this.toolRegistry),
      postDeployChecker: new PostDeployChecker(this.llm)
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
    this.safetyPolicyValidator = new SafetyPolicyValidator(this.llm);
    this.toolOutcomeValidator = new ToolOutcomeValidator(this.llm);

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
    const evaluation = await this._runCritics(results, aggregated, context);

    return {
      source: aggregated.source,
      response: aggregated.response,
      qualityScore: evaluation.adjustedScore,
      // Reflect the effective response channel (rag/action/chat) rather than
      // only the initial intent classification.
      phase: aggregated.source || results.phase,
      isValid: evaluation.policyPass && evaluation.adjustedScore > 0.5
    };
  }

  async _runCritics(results, aggregated, context) {
    this.parallelEvaluator.ragResults = results.rag || null;
    this.parallelEvaluator.actionResults = results.action || null;
    this.parallelEvaluator.chatResults = results.chat || null;

    const parallel = await this.parallelEvaluator.evaluateAll();

    let safeResponse = { safe: true };
    try {
      safeResponse = await this.safetyPolicyValidator.validateSafety(
        { answer: aggregated?.response?.answer || aggregated?.response?.message || '' },
        context
      );
    } catch (error) {
      safeResponse = { safe: true };
    }

    if (aggregated.source === 'action' && results.action?.success) {
      await this.toolOutcomeValidator.validateToolExecution(
        results.action.toolId,
        results.action.parameters || {},
        results.action.result
      );
    }

    const quality = this.qualityCalculator.calculate(
      {
        factually_correct: true,
        relevance: parallel.rag?.score || parallel.chat?.score || aggregated.qualityScore || 0.6,
        clarity: aggregated.qualityScore || 0.6,
        completeness: aggregated.qualityScore || 0.6
      },
      { severity: safeResponse.safe === false ? 1 : 0 }
    );

    return {
      policyPass: safeResponse.safe !== false,
      adjustedScore: Math.max(aggregated.qualityScore || 0, quality.adjusted_score)
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
      const fallback = await this.ragEngine.answerGenerator.fallbackMessage(context.context);
      return {
        answer: fallback.message || 'Je ne dispose pas encore de sources indexées pour répondre précisément.',
        sources: [],
        confidence: 0.55,
        has_information: true
      };
    }

    const reranked = await this.ragEngine.reranker.rerank(results, context.context);
    const answer = await this.ragEngine.answerGenerator.generate(reranked, context.context);

    return answer;
  }

  async _executeAction(context) {
    const plan = await this.actionEngine.actionPlanner.plan(context);

    if (!plan || !plan.tool) {
      const promoted = await this._runToolBuilderSandbox(context);
      if (!promoted) {
        return null;
      }

      const replanned = await this.actionEngine.actionPlanner.plan(context);
      if (!replanned || !replanned.tool) {
        return null;
      }

      return this._executeActionWithPlan(context, replanned);
    }

    return this._executeActionWithPlan(context, plan);
  }

  async _executeActionWithPlan(context, plan) {
    const toolId = plan.tool.id;

    const dryRun = await this.actionEngine.dryRunValidator.validate(plan.tool, plan.parameters);

    if (!dryRun?.valid) {
      const promoted = await this._runToolBuilderSandbox(context);
      if (!promoted) {
        return null;
      }
    }

    const risk = await this.actionEngine.riskChecker.checkRisk(dryRun, plan.parameters);

    if (risk.is_high_risk) {
      let approval = { approved: false };
      try {
        approval = await this.toolBuilder.hitlApprover.getApproval(
          {
            tool_id: toolId,
            name: plan.tool.name,
            description: plan.tool.description,
            parameters: plan.parameters
          },
          dryRun
        );
      } catch (error) {
        approval = { approved: false };
      }

      if (!approval.approved) {
        console.warn('[ACTION] High risk detected, approval denied');
        return null;
      }
    }

    const execution = await this.actionEngine.toolExecutor.execute(toolId, plan.parameters);

    if (execution.success) {
      const verify = await this.actionEngine.toolExecutor.verifyOutput(execution.result);
      return { success: true, toolId, parameters: plan.parameters, result: execution.result, verify };
    }

    return null;
  }

  async _runToolBuilderSandbox(context) {
    const tools = this.toolRegistry.getAllTools();
    const gap = await this.toolBuilder.gapDetector.detectGap(context, tools);

    if (!gap.needsNewTool) {
      return false;
    }

    const spec = await this.toolBuilder.specGenerator.generateSpec({
      tool_name: gap.toolName,
      tool_description: gap.toolDescription,
      entity_types: gap.entityTypes
    });
    const implementation = await this.toolBuilder.implementationGenerator.generateImplementation(spec);
    await this.toolBuilder.implementationGenerator.getStaticAnalysis(implementation);
    const tests = await this.toolBuilder.testGenerator.generateUnitTests(implementation, spec);
    const policy = await this.toolBuilder.policyGatekeeper.checkPolicy(spec, tests);

    if (!policy.policy_pass) {
      return false;
    }

    const dryRun = await this.toolBuilder.dryRunValidator.executeDryRun(implementation, spec);
    const approval = await this.toolBuilder.hitlApprover.getApproval(spec, dryRun);

    if (!approval.approved) {
      return false;
    }

    const promotion = await this.toolBuilder.toolPromoter.promote(spec, implementation);
    if (!promotion.success) {
      return false;
    }

    const smoke = await this.toolBuilder.postDeployChecker.smokeTest(promotion.toolId, dryRun?.dry_run_result || {});
    return smoke.pass === true;
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
