import { loadEnv } from './env.js';
import { agentConfigFromEnv, createAgent, type Backend } from './server.js';
import { startWhisper, transcribeWith } from './whisper-process.js';

// Starts whisper-server on an internal port and the HTTP agent in front of it.

const env = loadEnv();
const config = agentConfigFromEnv(env);
const model = env.WHISPER_MODEL === 'small' ? 'small' : 'base';
const modelPath = model === 'small' ? env.WHISPER_MODEL_SMALL : env.WHISPER_MODEL_BASE;
if (!env.WHISPER_SERVER_PATH || !modelPath) {
  console.error('Faltan WHISPER_SERVER_PATH o la ruta del modelo en .env. Ejecuta primero el script download.');
  process.exit(1);
}

const whisper = await startWhisper({
  serverPath: env.WHISPER_SERVER_PATH,
  modelPath,
  language: env.WHISPER_LANGUAGE || 'es',
  ...(env.WHISPER_PROMPT ? { prompt: env.WHISPER_PROMPT } : {}),
  port: Number(env.WHISPER_INTERNAL_PORT) || 8791,
});

const backend: Backend = {
  info: () => ({ recognizer: 'whisper', model, language: env.WHISPER_LANGUAGE || 'es' }),
  transcribe: (wav) => transcribeWith(whisper.url, wav),
};

const server = createAgent(config, backend);
server.listen(config.port, config.host, () => {
  console.log(`Agente local en http://${config.host}:${config.port} (modelo ${model})`);
  console.log(`Orígenes permitidos: ${config.allowedOrigins.join(', ')}`);
});

const shutdown = async (): Promise<void> => {
  server.close();
  await whisper.stop();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
