# helius-view

Visualiza uma codebase TS/JS como um grafo interativo (2D e 3D), pra entender projetos novos
e depurar funções sem ficar pulando entre arquivos.

## Instalação e uso

```sh
npm i -g helius-view
helius [caminho]
```

Ou sem instalar:

```sh
npx helius-view [caminho]
```

`caminho` é o diretório do projeto a analisar (padrão: `.`). O comando sobe um servidor local e
imprime a URL (abre o navegador automaticamente).

Flags:

- `-p, --port <porta>` — porta a usar (padrão `4317`; se estiver ocupada, tenta as próximas)
- `--no-open` — não abre o navegador automaticamente
- `--exclude <padrão>` — caminho/glob a excluir da análise (pode repetir)

## O que a interface faz

- Grafo de arquivos e suas dependências (imports), com progresso durante a análise
- Expandir um arquivo pra ver seus símbolos de topo (funções, classes, variáveis, tipos)
- Painel de cinco blocos ao clicar num símbolo: entrada, saída, processamento (com chamadas
  clicáveis), quem ele chama, quem o chama — com link pra abrir no editor
- Busca de arquivos e símbolos (`Ctrl+K`)
- Filtros por pasta (cor, colapso) e por tipo de aresta/nó
- Caminho entre dois nós (menor caminho)
- Alternância entre modo 2D e 3D
- Atualização ao vivo: o grafo reflete mudanças nos arquivos enquanto o servidor roda

## Limites conhecidos

- Só analisa TypeScript e JavaScript
- Análise estática: não executa o código, então não há valores reais de variáveis nem efeitos
  colaterais
- Frameworks sem resolução especial (Vue, Svelte, injeção de dependência, etc.) não têm
  adaptador — chamadas que dependem desse tipo de mágica podem não aparecer
- Chamadas dinâmicas (via `this[nome]`, `eval`, resolução em tempo de execução etc.) aparecem
  como não resolvidas no painel do símbolo

## Segurança

O servidor escuta só em `127.0.0.1` e valida os cabeçalhos `Host`/`Origin` das requisições
contra o host e a porta em que está de fato rodando. Ele expõe o código-fonte do projeto
analisado (caminhos, símbolos, trechos) para quem acessar essa porta — não exponha a porta a
outras máquinas ou redes.

## Desenvolvimento

```sh
npm run build      # tsup (servidor/CLI) + vite build (interface web)
npm run dev         # build com watch e reinício automático do CLI
npm run dev:web      # servidor de desenvolvimento só da interface web (vite)
npm run typecheck   # tsc --noEmit
npm test            # vitest, testes do analisador contra fixtures em test/fixtures
```
