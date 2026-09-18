# Changelog

## 1.0.0 (2026-09-18)


### Features

* **analyzer:** atualizacao incremental do grafo e invalidacao de nivel 2 ([e28e415](https://github.com/thomaz-santos/helius-view/commit/e28e4156d0d8c5974a78aadd5e856ae4e54e0f22))
* **analyzer:** descoberta de arquivos e imports do nivel 1 ([8262051](https://github.com/thomaz-santos/helius-view/commit/826205147a4a83ca845f76591f776244feae47e0))
* **analyzer:** extracao de simbolos e painel (symbols.ts, symbolDetail.ts) ([c45aec2](https://github.com/thomaz-santos/helius-view/commit/c45aec257f8802b7d116e3de626baefc9c1d952e))
* **analyzer:** infra do nivel 2 (fila, seguranca, project, indice) ([4dec6a1](https://github.com/thomaz-santos/helius-view/commit/4dec6a18def18e5968c4cfbded702b082c805a45))
* **analyzer:** liga simbolos/busca na worker, roda indice em segundo plano ([56fd5b8](https://github.com/thomaz-santos/helius-view/commit/56fd5b81ceabad37165e3c7900ece00baa9d748c))
* esqueleto com cli, servidor hono, worker do analisador e página react ([38d5847](https://github.com/thomaz-santos/helius-view/commit/38d58470c3216842eae176afea62a610654aafa9))
* **server:** observa a raiz com chokidar e encaminha as mudancas pro worker ([0dfad5a](https://github.com/thomaz-santos/helius-view/commit/0dfad5a7f57a122036269a315ddc91f26bd3259c))
* **server:** rotas /api/graph e /ws com progresso da analise ([fe6af22](https://github.com/thomaz-santos/helius-view/commit/fe6af229b6a06fae638f282ee356ca7d0e3a6e71))
* **server:** rotas /api/symbols, /api/symbol e /api/search ([7820bd1](https://github.com/thomaz-santos/helius-view/commit/7820bd149a7d542403d2795e8918710db957b73d))
* **shared:** formato do grafo e eventos de progresso do protocolo ([742cbdc](https://github.com/thomaz-santos/helius-view/commit/742cbdce002771f0bfdb1932403f13e20901f223))
* **shared:** tipos do painel de simbolo, busca e AnalyzerRequestBody ([e0e8c30](https://github.com/thomaz-santos/helius-view/commit/e0e8c305ace8647f7d218970742e61aa0f786238))
* **web:** aplica graph:patch ao vivo preservando selecao e posicoes ([94d20b9](https://github.com/thomaz-santos/helius-view/commit/94d20b99531204531181c7876a82f054118dbe81))
* **web:** árvore de pastas, colapso, busca Ctrl+K, foco e estado na URL ([107521c](https://github.com/thomaz-santos/helius-view/commit/107521c499dfaf7f4e432645e0537c4a8eac9b7d))
* **web:** busca (ctrl+k) passa a usar /api/search do servidor ([b962ae1](https://github.com/thomaz-santos/helius-view/commit/b962ae1cc3021ad492c116b42765b7c3966b17b1))
* **web:** caminho entre dois nos (BFS) e estilo compartilhado do grafo ([0086eef](https://github.com/thomaz-santos/helius-view/commit/0086eefa5a4b4672da282b0625e839455e26919c))
* **web:** expandir arquivo, filtro de tipos, call-possible tracejada ([2422138](https://github.com/thomaz-santos/helius-view/commit/2422138e7f28a856cc5f208792289f32a875966f))
* **web:** grafo 2D com force-graph, filtro de externos e barra de progresso ([308bb41](https://github.com/thomaz-santos/helius-view/commit/308bb41a7d58c671d745b0761845112ab9a00671))
* **web:** modo 3D (3d-force-graph) e a interface do caminho entre nos ([ed1fcea](https://github.com/thomaz-santos/helius-view/commit/ed1fcea07b351f9a9ba13c322249cda17d30180f))
* **web:** módulos puros de navegação (árvore, colapso, busca, URL) ([b506937](https://github.com/thomaz-santos/helius-view/commit/b50693796372a172a5b52abb7104ad11b80dcd58))
* **web:** painel de simbolo com os cinco blocos ([b68db11](https://github.com/thomaz-santos/helius-view/commit/b68db110adea8a633feacccbcabf98462a863f17))
* **web:** tokenizador de realce de sintaxe sem biblioteca ([4b30b39](https://github.com/thomaz-santos/helius-view/commit/4b30b39fc6f80a6daedc5288bcf9ffc670fb5da2))


### Bug Fixes

* **analyzer:** classify() reconhece import type multi-linha e require() ([cb06e88](https://github.com/thomaz-santos/helius-view/commit/cb06e884fd779c0a5373e853386a0a3df69ea23e))
* **analyzer:** trata qualquer tsconfig*.json como gatilho de reanalise completa ([25bf90d](https://github.com/thomaz-santos/helius-view/commit/25bf90d3ccd938ffb6ba821951a8ec2e6686d77c))
* **analyzer:** tsconfig solution style, alias quebrado e limite do Tarjan ([0e2783d](https://github.com/thomaz-santos/helius-view/commit/0e2783d4a674906dbe1b0f1d323da1ce0944e198))
* **dev:** proxy do vite reescreve Host/Origin pro middleware aceitar ([662dc98](https://github.com/thomaz-santos/helius-view/commit/662dc9838b9522eb5ee7968bebc0e7484b0f8ad6))
* **server:** /api/graph deixava de refletir atualizacoes ao vivo ([76626bd](https://github.com/thomaz-santos/helius-view/commit/76626bd9f65d897e8bfd37d894eb00d6d502b03e))
* **server:** recusa Host/Origin fora de 127.0.0.1|localhost ([16e401f](https://github.com/thomaz-santos/helius-view/commit/16e401f4a3bad5ec4bf820f5cc5ab62e7ad880f5))
* **web:** remove byte NUL literal do separador de linkKey ([af3eb3f](https://github.com/thomaz-santos/helius-view/commit/af3eb3fecb0ca09c257618068171e3060e902309))
* **web:** selecao e destaque nao reiniciam o layout do grafo ([f2ce218](https://github.com/thomaz-santos/helius-view/commit/f2ce218aa9d0970da9ba632b193092a520580e0b))
