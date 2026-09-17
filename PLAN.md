# helius-view — plano da v1

Pacote npm que sobe um servidor local e mostra a codebase como grafo (2D e 3D), para entender codebases novas e depurar funções.

## Decisões

| # | Tema | Decisão |
|---|------|---------|
| 1 | Linguagens | Só TS/JS, via Compiler API do TypeScript (`ts-morph`). Formato do grafo em JSON independente de linguagem. |
| 2 | Granularidade | Nível 1: arquivos + imports (na subida). Nível 2: símbolos de topo + chamadas/referências, sob demanda. Fluxo interno da função fora da v1. |
| 3 | Escopo | Padrões automáticos (`.gitignore`, `tsconfig`, sem `node_modules`/`dist`), caminho e `--exclude` na CLI, seleção fina na interface depois do mapa. Aviso acima de ~5.000 arquivos. |
| 4 | 2D/3D | Mesmo grafo em dois modos: `force-graph` (2D, principal) e `3d-force-graph`. Sem metáforas 3D próprias. |
| 5 | Painel do símbolo | Cinco blocos: entrada, saída, processamento (código com chamadas clicáveis), chama, é chamada por. Link "abrir no editor". Efeitos colaterais e valores de execução fora da v1. |
| 6 | Nome | Pacote `helius-view` (`helius` está ocupado no npm), comando `helius`. |
| 7 | Servidor | Hono em Node (`@hono/node-server`), sem exigir Bun. Escuta só em `127.0.0.1`; rotas validam que o caminho está dentro da raiz. |
| 8 | WebSocket | Progresso da análise + atualização ao vivo (`chokidar`, debounce ~300 ms, `graph:patch` preservando posições). Consultas continuam em `fetch`. |
| 9 | Imports | `ts.preProcessFile` + `ts.resolveModuleName`. Externos: um nó por pacote, escondidos por padrão. Monorepo: `tsconfig` mais próximo. Não resolvidos e circulares visíveis. |
| 10 | Ids | Arquivo: caminho relativo com `/`. Símbolo: `caminho#nomeQualificado`. Pacote: `pkg:nome`. Linha nunca entra no id. Tipos/interfaces são nós, escondidos por padrão. |
| 11 | Chamadas | Diretas pelo símbolo (seguindo aliases). Interface/abstrato: arestas `call-possible` tracejadas para as implementações. Função como argumento: `reference`. Não resolvidas listadas no painel. Adaptadores de framework fora da v1. |
| 12 | Navegação | Busca `Ctrl+K` (índice de nomes só sintático, em segundo plano), árvore de pastas com filtros, cor e colapso por pasta, foco em vizinhança com profundidade, caminho entre dois nós, estado na URL, tamanho do nó por dependentes. |
| 13 | Execução | Analisador inteiro numa `worker_thread` única, fila com prioridade (usuário > segundo plano), `Project` com carregamento preguiçoso. |
| 14 | Repositório | Pacote único: `src/{cli.ts,server,analyzer,shared}`, `web/` (React + Vite), `test/fixtures/`. Build com `tsup` + `vite build`, Node 20+, TypeScript embutido. |
| 15 | Testes | `vitest`, só no analisador, contra fixtures (alias, barrel, circular, interface com 2 implementações, default anônimo, JS puro, monorepo), mais patch ao vivo e recusa de `../`. |

## Formato do grafo

```json
{
  "nodes": [{ "id": "src/a.ts#foo", "kind": "function", "file": "src/a.ts", "name": "foo", "line": 12, "exported": true }],
  "links": [{ "source": "src/a.ts#foo", "target": "src/b.ts#bar", "kind": "call" }]
}
```

- Nós: `file`, `package`, `function`, `class`, `method`, `variable`, `type`
- Arestas: `import`, `import-type`, `import-dynamic`, `call`, `call-possible`, `reference`, `extends`, `implements`

## API

- `GET /api/graph` — nível 1
- `GET /api/symbols?file=...` — símbolos de um arquivo
- `GET /api/symbol?id=...` — os cinco blocos
- `GET /api/search?q=...` — índice de nomes
- `WS /ws` — `progress`, `graph:patch`

## Ordem de construção

1. Esqueleto: CLI, Hono, página React vazia, ping na worker, `npm link`.
2. Nível 1 no 2D, com progresso.
3. Navegação: árvore, filtros, cores, colapso, busca de arquivos, URL.
4. Nível 2 e painel de cinco blocos.
5. Atualização ao vivo.
6. Modo 3D e caminho entre dois nós.
7. README, teste em codebases reais, `npm publish`.

## Fora da v1

Outras linguagens, fluxo interno da função, efeitos colaterais, valores de execução, adaptadores de framework, cache em disco, várias workers, `.vue`/`.svelte`, anotações, visões salvas, exportar imagem, métricas, git.
