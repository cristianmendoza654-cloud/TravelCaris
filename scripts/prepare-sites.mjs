import { cp, mkdir, writeFile } from 'node:fs/promises';

await mkdir('dist/server', { recursive: true });
await mkdir('dist/.openai', { recursive: true });
await cp('.openai/hosting.json', 'dist/.openai/hosting.json');

const worker = `
const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, max-age=0',
    },
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/flights/status') {
      if (request.method === 'GET') {
        return json({
          provider: 'manual',
          configured: false,
          automaticUpdatesAvailable: false,
        });
      }
      if (request.method === 'POST') {
        return json(
          {
            error:
              'La actualización automática no está configurada. Consulta la fuente oficial y registra los cambios manualmente.',
          },
          503,
        );
      }
      return json({ error: 'Método no permitido.' }, 405);
    }
    return env.ASSETS.fetch(request);
  },
};
`;

await writeFile('dist/server/index.js', worker.trimStart(), 'utf8');
