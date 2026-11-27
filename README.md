# Assistente de Gestor de Saúde Municipal

Extensão para Google Chrome que extrai relatórios de produção do **SISAB**, **SIA** e **SI-PNI**, organiza os dados em CSV e salva tudo em **um único ZIP**. A extração acontece no painel lateral do navegador.

O SISAB usa a sessão que o usuário já abriu no e-Gestor; a extensão não pede senha nem faz login no gov.br. Os dados do TabNet Municipal são públicos e podem ser baixados a partir de qualquer página. A extensão não usa servidor próprio: consulta as fontes oficiais e salva o resultado no computador do usuário.

## Como instalar

1. Baixe o arquivo [**assistente-gestor-saude-municipal-1.0.0.zip**](https://github.com/saude-digital-rio/e-gestor-helper/releases/download/v1.0.0/assistente-gestor-saude-municipal-1.0.0.zip).
2. Extraia o ZIP em uma pasta que permanecerá no computador. Dentro dela deve estar o arquivo `manifest.json`.
3. No Chrome para computador, abra `chrome://extensions` e ative **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação** e selecione a pasta extraída.
5. Se quiser, fixe o ícone da extensão no menu de extensões do Chrome. Clique nele para abrir o painel lateral.

O ZIP **não instala com duplo clique**. Em computadores administrados por uma organização, o Modo do desenvolvedor pode estar bloqueado. Para atualizar uma instalação manual, substitua os arquivos na mesma pasta e clique em **Recarregar** em `chrome://extensions`.

## Como usar

1. Para extrair **SISAB**, entre no [e-Gestor](https://egestorab.saude.gov.br/paginas/acessoRestrito/perfilAcesso.xhtml) e mantenha aberta a página **Perfil de Acesso**. Os controles desse módulo só ficam disponíveis nessa página. **SIA** e **SI-PNI** funcionam em qualquer página, sem login.
2. No painel lateral, escolha a **última competência disponível** ou as **últimas 6 ou 12**. Cada fonte procura suas próprias competências mais recentes com dados.
3. Abra os módulos desejados e marque os relatórios. **Todos** seleciona ou desmarca os relatórios do módulo; o botão **?** explica cada fonte.
4. Clique em **Extrair ZIP**. Mantenha o painel aberto enquanto as etapas avançam. Se incluiu o SISAB, mantenha também a aba do e-Gestor/SISAB aberta.
5. Ao terminar, encontre o ZIP na pasta **Downloads** do Chrome. Ele contém os CSVs selecionados, em UTF-8 com BOM.

| Módulo | Relatórios disponíveis |
| --- | --- |
| **SISAB** | Atendimentos individuais (enfermeiro, dentista e médico), procedimentos, visitas domiciliares e atividade coletiva, por equipe/INE e competência. |
| **SIA @ TabNet Municipal** | Procedimentos na APS e procedimentos especializados, por estabelecimento e mês de cobrança. |
| **SI-PNI @ TabNet Municipal** | Campanha de vacinação contra COVID-19, por estabelecimento de saúde e mês da vacinação. |

O SISAB respeita o acesso e as permissões do usuário no e-Gestor. Se a sessão expirar, entre novamente e reinicie a extração. A extensão não contorna o gov.br.

## Telas

Capturas da interface com dados ilustrativos, sem relatórios reais.

| SISAB no e-Gestor | SIA no TabNet Municipal |
| --- | --- |
| <img src="docs/images/sisab.png" alt="Painel lateral com os relatórios do SISAB disponíveis na página Perfil de Acesso" width="380"> | <img src="docs/images/painel.png" alt="Painel lateral com os módulos SISAB, SIA e SI-PNI e seleção de relatórios do SIA" width="380"> |

| SI-PNI no TabNet Municipal | Acompanhamento da extração |
| --- | --- |
| <img src="docs/images/si-pni.png" alt="Módulo SI-PNI aberto com a opção de vacinação contra COVID-19" width="380"> | <img src="docs/images/progresso.png" alt="Tela de progresso com etapas do SIA e SI-PNI, barra de competências e lista de arquivos extraídos" width="380"> |

## Desenvolvimento

O projeto usa Manifest V3, sem build nem dependências de produção. Rode `npm test` para verificar a seleção de competências, o tratamento dos CSVs e o ZIP. Rode `python3 scripts/package.py` para gerar um pacote de distribuição em `dist/`, com `manifest.json` na raiz.

O Chrome gera o ID técnico da instalação local. Para preservá-lo nas atualizações manuais, mantenha a pasta extraída no mesmo caminho.
