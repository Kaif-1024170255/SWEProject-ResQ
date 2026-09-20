import dotenv from 'dotenv';
dotenv.config();
import { classifyWithGemini } from '../src/services/classification';

async function test() {
  const apiKey = process.env.GEMINI_API_KEY;
  console.log('Testing classifyWithGemini, apiKey length:', apiKey?.length);
  const start = Date.now();
  const res = await classifyWithGemini('Elderly resident trapped on rooftop in flood water, boat rescue needed', apiKey!);
  console.log('Elapsed:', Date.now() - start, 'ms');
  console.log('Gemini Result:', res);
}

test().catch(console.error);
