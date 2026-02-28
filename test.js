import { BrainSystem } from './index.js';
import { OpenAIInterface } from './src/common.js';

process.env.OPENAI_OFFLINE = process.env.OPENAI_OFFLINE || 'true';

console.log('🧪 Testing BrainSystem Implementation');

const system = new BrainSystem();

console.log('✅ BrainSystem created successfully');
console.log('');

const result = await system.processUserInput('What is 10 + 20?');
console.log('Input: "What is 10 + 20?"');
console.log('Response:', result);
console.log('');

const log = system.observabilityLog;
console.log('🧪 Observability Stats:');
console.log('Safety checks:', log.safetyChecks.length);
console.log('Errors:', log.errors.length);
console.log('Debug records:', log.debugData.size);
console.log('Done!')