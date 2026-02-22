#!/usr/bin/env node

import { BufferSystem } from './src/index.js';
import * as dotenv from 'dotenv';

dotenv.config();

console.log('🚀 Buffer-System Quick Start');

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('❌ ERROR: OPENAI_API_KEY environment variable is required');
  console.log('\n📝 Setup instructions:');
  console.log('1. Copy .env.example to .env');
  console.log('2. Add your OpenAI API key');
  console.log('3. Run: node src/index.js');
  process.exit(1);
}

try {
  const system = new BufferSystem();
  const result = await system.processUserInput('What is 42 + 58?');

  console.log('\n💬 User Input:', 'What is 42 + 58?');
  console.log('💬 System Response:', result);
  console.log('');
  console.log('✅ Setup complete! Your Buffer-System is ready.');

} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}