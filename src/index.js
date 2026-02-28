#!/usr/bin/env node

import { BrainSystem } from '../index.js';

console.log('🚀 Brain-System Quick Start');

const system = new BrainSystem();
const input = 'What is 42 + 58?';

try {
  const result = await system.processUserInput(input);

  console.log('\n💬 User Input:', input);
  console.log('💬 System Response:', result);
  console.log('');
  console.log('✅ Setup complete! Your Brain-System is ready.');

} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
