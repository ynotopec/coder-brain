#!/usr/bin/env node

import { BufferSystem } from '../index.js';

console.log('🚀 Buffer-System Quick Start');

const system = new BufferSystem();
const input = 'What is 42 + 58?';

try {
  const result = await system.processUserInput(input);

  console.log('\n💬 User Input:', input);
  console.log('💬 System Response:', result);
  console.log('');
  console.log('✅ Setup complete! Your Buffer-System is ready.');

} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
