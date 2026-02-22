import { BufferSystem } from './index.js';
import { OpenAIInterface } from './src/common.js';

console.log('🧪 Testing BufferSystem Implementation');

const system = new BufferSystem();

console.log('✅ BufferSystem created successfully');
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