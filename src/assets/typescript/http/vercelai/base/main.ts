import { BedrockAgentCoreApp } from 'bedrock-agentcore/runtime';
import { streamText } from 'ai';
import { loadModel } from './model/load.js';

const SYSTEM_PROMPT = `You are a helpful assistant.`;

const app = new BedrockAgentCoreApp({
  invocationHandler: {
    async *process(payload: { prompt?: string }, context: { sessionId?: string; userId?: string }) {
      const result = streamText({
        model: loadModel(),
        system: SYSTEM_PROMPT,
        prompt: payload.prompt ?? '',
      });

      for await (const chunk of result.textStream) {
        yield { data: chunk };
      }
    },
  },
});

app.run();
